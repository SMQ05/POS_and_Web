// Server-side decryption for KXV2 (.kxv) export files.
//
// Export files are encrypted in the browser with an embedded RSA *public* key
// (hybrid: a random AES-256-GCM key wrapped via RSA-OAEP). Only this module —
// holding the RSA *private* key (env KXV_PRIVATE_KEY, never shipped to clients)
// — can unwrap them. The decryption routine and key never exist in the bundle,
// so a competitor reverse-engineering the app cannot read .kxv files.

import crypto from 'node:crypto';

const MAGIC_V2 = 'KXV2:';

function getPrivateKey(): string {
  const pem = process.env.KXV_PRIVATE_KEY;
  if (!pem) throw new Error('KXV_PRIVATE_KEY is not configured on the server.');
  // .env stores the PEM with literal "\n"; restore real newlines.
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

export function isKxv2(payload: string): boolean {
  return typeof payload === 'string' && payload.startsWith(MAGIC_V2);
}

/**
 * Decrypt a `KXV2:` payload → plaintext. Throws on bad/tampered input
 * (GCM auth tag mismatch) or if the private key is missing.
 */
export function decryptKxv2(payload: string): string {
  if (!isKxv2(payload)) throw new Error('Not a KXV2 export file.');
  const packed = Buffer.from(payload.slice(MAGIC_V2.length).trim(), 'base64');

  const wrappedLen = (packed[0] << 8) | packed[1];
  let off = 2;
  const wrapped = packed.subarray(off, off + wrappedLen); off += wrappedLen;
  const iv = packed.subarray(off, off + 12); off += 12;
  const ctWithTag = packed.subarray(off);
  // WebCrypto AES-GCM appends the 16-byte auth tag to the ciphertext.
  const tag = ctWithTag.subarray(ctWithTag.length - 16);
  const ct = ctWithTag.subarray(0, ctWithTag.length - 16);

  const aesKey = crypto.privateDecrypt(
    { key: getPrivateKey(), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    wrapped,
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
