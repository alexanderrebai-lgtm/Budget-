-- Connexions bancaires (agrégateur Enable Banking). Les opérations ne sont jamais stockées ici :
-- seules les références de session nécessaires pour interroger la banque.

-- Autorisations en cours (le paramètre « state » relie le retour de la banque à l'utilisateur).
create table public.bank_auths (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  aspsp_name text not null,
  aspsp_country text not null,
  return_to text,
  created_at timestamptz not null default now()
);
alter table public.bank_auths enable row level security;
-- aucune politique : table réservée à la fonction serveur (rôle service)

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null unique,
  aspsp_name text not null,
  aspsp_country text not null,
  aspsp_logo text,
  valid_until timestamptz,
  -- [{ uid, name, iban_masked, currency, identification_hash }]
  accounts jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_sync_at timestamptz
);
create index bank_connections_user_idx on public.bank_connections (user_id);
alter table public.bank_connections enable row level security;

create policy "bank_connections_select_own" on public.bank_connections
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.bank_connections to authenticated;
