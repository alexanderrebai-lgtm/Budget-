// Fonction Supabase « bank » : connexion aux banques via Enable Banking (DSP2).
//
// Secrets requis (tableau de bord Supabase → Edge Functions → Secrets) :
//   ENABLE_BANKING_APP_ID       identifiant de l'application Enable Banking
//   ENABLE_BANKING_PRIVATE_KEY  clé privée RSA (PEM) de l'application
// L'adresse de retour à déclarer chez Enable Banking est :
//   https://<projet>.supabase.co/functions/v1/bank/callback
//
// Les opérations bancaires traversent la fonction sans y être enregistrées.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { maskIban, normalizeTransactions, pickBalance, signEnableBankingJwt, type EbTransaction } from './lib.ts';

const API = 'https://api.enablebanking.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_ID = Deno.env.get('ENABLE_BANKING_APP_ID');
const PRIVATE_KEY = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY');

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

function configured() {
  return Boolean(APP_ID && PRIVATE_KEY);
}

async function eb<T>(method: string, path: string, body?: unknown, psuHeaders: Record<string, string> = {}): Promise<T> {
  if (!configured()) throw new HttpError(503, 'Connexion bancaire non configurée sur le serveur.', 'NOT_CONFIGURED');
  const jwt = await signEnableBankingJwt(APP_ID!, PRIVATE_KEY!);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...psuHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data?.error ?? data?.code ?? '') as string;
    throw new HttpError(res.status, String(data?.message ?? data?.detail ?? `Erreur ${res.status} de l’agrégateur`), code);
  }
  return data as T;
}

/** En-têtes « PSU » transmis à la banque quand l'utilisateur est présent (limite moins stricte). */
function psuHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = {};
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) h['Psu-Ip-Address'] = ip;
  const ua = req.headers.get('user-agent');
  if (ua) h['Psu-User-Agent'] = ua;
  return h;
}

async function currentUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Connectez-vous à votre compte Cap Budget.');
  return data.user;
}

async function ownConnection(userId: string, id: string) {
  const { data, error } = await admin.from('bank_connections').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Connexion bancaire introuvable.');
  return data;
}

/* ---------------- Retour de la banque (public) ---------------- */

async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const { data: pending } = await admin.from('bank_auths').select('*').eq('state', state).maybeSingle();
  if (!pending) return text('Lien expiré ou déjà utilisé. Relancez la connexion depuis Cap Budget.', 400);
  await admin.from('bank_auths').delete().eq('state', state);
  if (Date.now() - new Date(pending.created_at).getTime() > 30 * 60_000) {
    return text('Le délai de connexion est dépassé. Relancez la connexion depuis Cap Budget.', 400);
  }

  const back = (status: 'ok' | 'error', message: string) => {
    if (pending.return_to && /^https?:\/\//.test(pending.return_to)) {
      const target = new URL(pending.return_to);
      target.hash = `/banques?bank=${status}&message=${encodeURIComponent(message)}`;
      return Response.redirect(target.toString(), 302);
    }
    return text(`${message}\n\nVous pouvez fermer cette page et revenir dans Cap Budget.`, status === 'ok' ? 200 : 400);
  };

  if (error || !code) return back('error', `Connexion refusée par la banque (${url.searchParams.get('error_description') ?? error ?? 'aucun code'}).`);

  try {
    const session = await eb<{
      session_id: string;
      accounts: { uid: string; name?: string; account_id?: { iban?: string }; currency?: string; identification_hash?: string; product?: string }[];
      aspsp: { name: string; country: string };
      access: { valid_until: string };
    }>('POST', '/sessions', { code });
    const accounts = session.accounts.map((a) => ({
      uid: a.uid,
      name: a.name || a.product || 'Compte',
      iban_masked: maskIban(a.account_id?.iban),
      currency: a.currency ?? 'EUR',
      identification_hash: a.identification_hash ?? null,
    }));
    const { error: insErr } = await admin.from('bank_connections').insert({
      user_id: pending.user_id,
      session_id: session.session_id,
      aspsp_name: session.aspsp.name,
      aspsp_country: session.aspsp.country,
      valid_until: session.access?.valid_until ?? null,
      accounts,
    });
    if (insErr) throw insErr;
    return back('ok', `${session.aspsp.name} connectée : ${accounts.length} compte(s).`);
  } catch (e) {
    return back('error', `Échec de la connexion : ${(e as Error).message}`);
  }
}

/* ---------------- API appelée par l'application ---------------- */

async function handleApi(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'status') return json({ configured: configured() });

  const user = await currentUser(req);

  switch (action) {
    case 'aspsps': {
      const country = String(body.country ?? 'FR').toUpperCase().slice(0, 2);
      const data = await eb<{ aspsps: { name: string; country: string; logo?: string; maximum_consent_validity?: number; psu_types?: string[]; beta?: boolean }[] }>(
        'GET',
        `/aspsps?country=${country}&service=AIS`,
      );
      return json({
        aspsps: data.aspsps
          .filter((a) => !a.psu_types || a.psu_types.includes('personal'))
          .map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null, beta: a.beta ?? false, maxDays: Math.floor((a.maximum_consent_validity ?? 7_776_000) / 86_400) })),
      });
    }

    case 'start': {
      const name = String(body.aspsp?.name ?? '');
      const country = String(body.aspsp?.country ?? 'FR');
      if (!name) throw new HttpError(400, 'Banque manquante.');
      const days = Math.max(1, Math.min(180, Number(body.days ?? 90)));
      const validUntil = new Date(Date.now() + days * 86_400_000).toISOString();
      const state = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
      const returnTo = typeof body.return_to === 'string' && /^https:\/\//.test(body.return_to) ? body.return_to : null;
      // nettoyage des autorisations abandonnées
      await admin.from('bank_auths').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString());
      const { error } = await admin.from('bank_auths').insert({ state, user_id: user.id, aspsp_name: name, aspsp_country: country, return_to: returnTo });
      if (error) throw error;
      const redirectUrl = `${SUPABASE_URL}/functions/v1/bank/callback`;
      const auth = await eb<{ url: string }>(
        'POST',
        '/auth',
        { access: { valid_until: validUntil }, aspsp: { name, country }, state, redirect_url: redirectUrl, psu_type: 'personal', language: 'fr' },
        psuHeaders(req),
      );
      return json({ url: auth.url });
    }

    case 'transactions': {
      const conn = await ownConnection(user.id, String(body.connection_id));
      const uid = String(body.account_uid);
      if (!conn.accounts.some((a: { uid: string }) => a.uid === uid)) throw new HttpError(404, 'Compte introuvable dans cette connexion.');
      const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(body.date_from ?? '') ? body.date_from : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const headers = body.interactive ? psuHeaders(req) : {};
      const all: EbTransaction[] = [];
      let key: string | null = null;
      for (let page = 0; page < 50; page++) {
        const qs = new URLSearchParams({ date_from: dateFrom });
        if (key) qs.set('continuation_key', key);
        const res: { transactions: EbTransaction[]; continuation_key?: string | null } = await eb('GET', `/accounts/${uid}/transactions?${qs}`, undefined, headers);
        all.push(...(res.transactions ?? []));
        key = res.continuation_key ?? null;
        if (!key) break;
      }
      let balance: number | null = null;
      try {
        const b = await eb<{ balances: { balance_amount: { amount: string; currency: string }; balance_type: string }[] }>('GET', `/accounts/${uid}/balances`, undefined, headers);
        balance = pickBalance(b.balances ?? []);
      } catch {
        /* certaines banques ne fournissent pas le solde */
      }
      await admin.from('bank_connections').update({ last_sync_at: new Date().toISOString(), status: 'active' }).eq('id', conn.id);
      return json({ rows: normalizeTransactions(all), balance });
    }

    case 'delete': {
      const conn = await ownConnection(user.id, String(body.connection_id));
      try {
        await eb('DELETE', `/sessions/${conn.session_id}`);
      } catch {
        /* session déjà expirée côté banque */
      }
      await admin.from('bank_connections').delete().eq('id', conn.id);
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, 'Action inconnue.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET' && url.pathname.endsWith('/callback')) return await handleCallback(url);
    if (req.method === 'POST') return await handleApi(req);
    return text('Not found', 404);
  } catch (e) {
    if (e instanceof HttpError) {
      // session expirée chez la banque : on le signale pour proposer une reconnexion
      if (e.code === 'EXPIRED_SESSION') {
        return json({ error: 'La connexion à la banque a expiré : reconnectez-la.', code: 'EXPIRED_SESSION' }, 401);
      }
      return json({ error: e.message, code: e.code ?? null }, e.status);
    }
    console.error(e);
    return json({ error: 'Erreur interne.' }, 500);
  }
});
