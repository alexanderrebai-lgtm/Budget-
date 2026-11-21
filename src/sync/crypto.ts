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

/** Clé de chiffrement prête à l'emploi (non exportable), avec les paramètres qui l'ont produite. */
export interface KeyMaterial {
  key: CryptoKey;
  salt: string;
  iterations: number;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non exportable : la clé ne peut pas être lue, seulement utilisée
    ['encrypt', 'decrypt'],
  );
}

/** Sel propre à chaque compte : la même phrase donne la même clé sur tous les appareils de l'utilisateur. */
export async function userSalt(userId: string): Promise<Uint8Array> {
  const h = await subtle().digest('SHA-256', new TextEncoder().encode(`cap-budget-e2e:${userId}`));
  return new Uint8Array(h).slice(0, 16);
}

export async function deriveKeyMaterial(passphrase: string, salt: Uint8Array, iterations = ITERATIONS): Promise<KeyMaterial> {
  return { key: await deriveKey(passphrase, salt, iterations), salt: toB64(salt), iterations };
}

export async function seal(data: unknown, km: KeyMaterial | null): Promise<Payload> {
  if (!km) return { format: 'cap-budget', v: 1, enc: 'none', data };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await streamBytes(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip'));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, km.key, packed as BufferSource);
  return {
    format: 'cap-budget',
    v: 1,
    enc: 'aes-gcm',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: km.iterations, salt: km.salt },
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

/** Le contenu chiffré l'a-t-il été avec cette clé (même sel, mêmes paramètres) ? */
export const sealedWith = (payload: Payload, km: KeyMaterial | null) =>
  payload.enc === 'aes-gcm' && !!km && payload.kdf.salt === km.salt && payload.kdf.iterations === km.iterations;

/**
 * Déchiffre avec la clé enregistrée ; si le contenu a été chiffré avec d'autres paramètres
 * (ancienne version, autre appareil), la phrase secrète saisie dans la session est nécessaire.
 */
export async function open(payload: Payload, km: KeyMaterial | null, passphrase: string | null = null): Promise<unknown> {
  if (payload?.format !== 'cap-budget') throw new Error('Format de données distant inconnu.');
  if (payload.enc === 'none') return payload.data;
  let key: CryptoKey;
  if (sealedWith(payload, km)) key = km!.key;
  else if (passphrase) key = await deriveKey(passphrase, fromB64(payload.kdf.salt), payload.kdf.iterations);
  else throw new PassphraseRequiredError();
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) as BufferSource }, key, fromB64(payload.ct) as BufferSource);
  } catch {
    throw new WrongPassphraseError();
  }
  const json = await streamBytes(new Uint8Array(plain), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(json));
}
