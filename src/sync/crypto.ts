/**
 * Chiffrement de bout en bout facultatif : les données sont compressées puis
 * chiffrées (AES-GCM 256) avec une clé dérivée de la phrase secrète
 * (PBKDF2-SHA-256). Le serveur ne voit jamais les données en clair.
 */

export interface PlainPayload {
  format: 'cap-budget';
  v: 1;
  enc: 'none';
  data: unknown;
}
export interface EncryptedPayload {
  format: 'cap-budget';
  v: 1;
  enc: 'aes-gcm';
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  ct: string;
}
export type Payload = PlainPayload | EncryptedPayload;

export class WrongPassphraseError extends Error {
  constructor() {
    super('Phrase secrète incorrecte.');
  }
}
export class PassphraseRequiredError extends Error {
  constructor() {
    super('Ces données sont chiffrées : saisissez votre phrase secrète.');
  }
}

const ITERATIONS = 310_000;
const subtle = () => globalThis.crypto.subtle;

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function streamBytes(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const keyCache = new Map<string, CryptoKey>();

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const id = `${passphrase}|${toB64(salt)}|${iterations}`;
  const cached = keyCache.get(id);
  if (cached) return cached;
  const material = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(id, key);
  return key;
}

/** Sel réutilisé tant que la phrase ne change pas, pour profiter du cache de clé. */
let saltForSession: { passphrase: string; salt: Uint8Array } | null = null;

export async function seal(data: unknown, passphrase: string | null): Promise<Payload> {
  if (!passphrase) return { format: 'cap-budget', v: 1, enc: 'none', data };
  if (!saltForSession || saltForSession.passphrase !== passphrase) {
    saltForSession = { passphrase, salt: crypto.getRandomValues(new Uint8Array(16)) };
  }
  const salt = saltForSession.salt;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const packed = await streamBytes(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip'));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, packed as BufferSource);
  return {
    format: 'cap-budget',
    v: 1,
    enc: 'aes-gcm',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

export async function open(payload: Payload, passphrase: string | null): Promise<unknown> {
  if (payload?.format !== 'cap-budget') throw new Error('Format de données distant inconnu.');
  if (payload.enc === 'none') return payload.data;
  if (!passphrase) throw new PassphraseRequiredError();
  const salt = fromB64(payload.kdf.salt);
  const key = await deriveKey(passphrase, salt, payload.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) as BufferSource }, key, fromB64(payload.ct) as BufferSource);
  } catch {
    throw new WrongPassphraseError();
  }
  saltForSession = { passphrase, salt };
  const json = await streamBytes(new Uint8Array(plain), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(json));
}
