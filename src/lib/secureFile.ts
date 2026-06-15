// Proprietary export encryption (.kxv = Kynex eXport).
//
// Data exports (inventory dumps, ledgers, audit logs, reports) are encrypted so
// they're unreadable in Excel/Notepad and unreadable by competitors. Blank
// templates stay plain CSV (users fill those in Excel).
//
// ── Format KXV2 (envelope / public-key) ──────────────────────────────────────
// Export happens entirely in the browser using an embedded RSA *public* key:
//   1. generate a random AES-256-GCM key,
//   2. AES-GCM encrypt the data,
//   3. RSA-OAEP wrap the AES key with the public key.
// The public key can only ENCRYPT, so a competitor who extracts it from the
// bundle cannot decrypt anything. Decryption needs the RSA *private* key, which
// lives ONLY on the backend — so importing a .kxv file goes through the server
// (POST /api/secure/decrypt). The decryption routine/key never ship to clients.
//
// ── Format KXV1 (legacy symmetric) ───────────────────────────────────────────
// Older exports used a bundled AES key. We still decrypt those locally for
// backward compatibility, but new exports are always KXV2.

const MAGIC_V1 = 'KXV1:';
const MAGIC_V2 = 'KXV2:';

// Legacy symmetric secret (KXV1 read-back only — never used for new exports).
const APP_SECRET = 'kynex-pharmacloud::export::v1::a7f3c9e1';

// Embedded RSA-3072 PUBLIC key (safe to ship — encrypt-only). The matching
// private key lives on the server as KXV_PRIVATE_KEY and never leaves it.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAwz+s5vTD42WR8e4ORfPk
Mm9LPwlBLL3Vh5JlZRKOfgZOQpMXnljin5ECM4tUL+lSlCcEi5jb9ZhafbFiwD4E
TetttYbbch0B2cDner/x/8NCikMhwKWcs7SY/TUuQ2bF039raHwYFKzS08v2552a
0sVuqXGCQ+v2iRFYcNETfCJ59hqbQbsabJqfIbt5w9FoFEQDgpljnfLyLMKuz9E8
ls2q3sLqi7Ejtp6emz4ELgEz7SivudJnich9jIseyK/mEGJwd5dW2HyCx/jMsg2H
9vLFC3ljaJJYFgYqHg++PdJ9h7sCMj6B5ed5Gpk7/rNGFHNuBC9C3kaeY+7FQOue
IvO7jcPepjThxXDmzM/4zAthlxIxs8QnUyP7XqcGcJg4QSA1Q7F1NIkFASN+05HP
JofliQ77yHp2Qpw9zIztkrfc2XiecjH5MFBsbRpjE60SszvBA/exd6fgbGPL3sBk
zNjzTJ+UQyJrnAq2EjG6t/Uf9Io6VRYfrsB5ZS3Rx+frAgMBAAE=
-----END PUBLIC KEY-----`;

// ─── helpers ─────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

let pubKeyPromise: Promise<CryptoKey> | null = null;
function getPublicKey(): Promise<CryptoKey> {
  if (!pubKeyPromise) {
    const der = fromBase64(PUBLIC_KEY_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
    pubKeyPromise = crypto.subtle.importKey(
      'spki',
      der.buffer as ArrayBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }
  return pubKeyPromise;
}

// ─── detection ───────────────────────────────────────────────────────────────

export function isEncryptedExport(text: string): boolean {
  return text.startsWith(MAGIC_V2) || text.startsWith(MAGIC_V1);
}

/** KXV2 envelope files must be decrypted by the server (private key is server-only). */
export function needsServerDecrypt(text: string): boolean {
  return text.startsWith(MAGIC_V2);
}

// ─── export (KXV2 envelope) ──────────────────────────────────────────────────

/**
 * Encrypt plaintext → `KXV2:<base64(wrappedKeyLen|wrappedKey|iv|ciphertext+tag)>`.
 * Uses hybrid encryption: random AES-256-GCM key wrapped with the embedded RSA
 * public key. Only the server's private key can unwrap it.
 */
export async function encryptExport(plaintext: string): Promise<string> {
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext)),
  );
  const rawAes = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey)); // 32 bytes
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await getPublicKey(), rawAes));

  const packed = new Uint8Array(2 + wrapped.length + iv.length + ct.length);
  packed[0] = (wrapped.length >> 8) & 0xff;
  packed[1] = wrapped.length & 0xff;
  packed.set(wrapped, 2);
  packed.set(iv, 2 + wrapped.length);
  packed.set(ct, 2 + wrapped.length + iv.length);
  return MAGIC_V2 + toBase64(packed);
}

// ─── legacy import (KXV1 symmetric, local) ───────────────────────────────────

let legacyKeyPromise: Promise<CryptoKey> | null = null;
function getLegacyKey(): Promise<CryptoKey> {
  if (!legacyKeyPromise) {
    legacyKeyPromise = (async () => {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(APP_SECRET));
      return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
    })();
  }
  return legacyKeyPromise;
}

/**
 * Decrypt a legacy `KXV1:` payload locally. KXV2 files cannot be decrypted on
 * the client — call the server (see backend.decryptSecureExport). Throws for
 * KXV2 input so callers route it correctly.
 */
export async function decryptExport(payload: string): Promise<string> {
  if (payload.startsWith(MAGIC_V2)) {
    throw new Error('KXV2 files must be decrypted by the server.');
  }
  const body = payload.startsWith(MAGIC_V1) ? payload.slice(MAGIC_V1.length) : payload;
  const packed = fromBase64(body.trim());
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const key = await getLegacyKey();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ─── download ────────────────────────────────────────────────────────────────

/** Trigger a browser download of arbitrary text content. */
export function downloadText(filename: string, content: string, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
