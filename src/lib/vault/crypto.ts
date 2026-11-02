// docs/09 §3. Runs in the browser and on the server. No key or plaintext lives here: the sealed
// message is public, and it opens only with all four keys.
const INFO = 'SPIDEY-TRACXER-FINAL-V1';
const encoder = new TextEncoder();

export type SealedMessage = { salt: string; iv: string; ciphertext: string };

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Length-prefixed, so moving characters from one key to the next can't produce the same input.
function keyMaterial(keys: string[]): Uint8Array<ArrayBuffer> {
  const parts = keys.flatMap((key) => {
    const bytes = encoder.encode(key);
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    return [length, bytes];
  });
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function deriveKey(keys: string[], salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', keyMaterial(keys), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealMessage(keys: string[], plaintext: string): Promise<SealedMessage> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(keys, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(data)) };
}

// null for any wrong or missing key, with nothing to say which.
export async function openMessage(keys: string[], sealed: SealedMessage): Promise<string | null> {
  try {
    const key = await deriveKey(keys, fromBase64(sealed.salt));
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.ciphertext),
    );
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}
