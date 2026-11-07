// Code Space: decoding steps teams can chain in the browser. Pure functions on bytes; nothing here
// knows any answer, it only transforms what a team pastes in.

export type OpId =
  | 'from_base64'
  | 'to_base64'
  | 'from_hex'
  | 'to_hex'
  | 'xor'
  | 'rot'
  | 'from_binary'
  | 'to_binary'
  | 'url_decode'
  | 'reverse'
  | 'base_to_dec'
  | 'dec_to_base';

export const OPS: { id: OpId; label: string; param?: { label: string; initial: string } }[] = [
  { id: 'from_base64', label: 'From Base64' },
  { id: 'to_base64', label: 'To Base64' },
  { id: 'from_hex', label: 'From Hex' },
  { id: 'to_hex', label: 'To Hex' },
  {
    id: 'xor',
    label: 'XOR with key',
    param: { label: 'Key (text, or 0x… for hex bytes)', initial: '' },
  },
  { id: 'rot', label: 'ROT / Caesar shift', param: { label: 'Shift', initial: '13' } },
  { id: 'from_binary', label: 'From Binary' },
  { id: 'to_binary', label: 'To Binary' },
  { id: 'url_decode', label: 'URL decode' },
  { id: 'reverse', label: 'Reverse' },
  {
    id: 'base_to_dec',
    label: 'Number: base N → decimal',
    param: { label: 'From base (2-36)', initial: '8' },
  },
  {
    id: 'dec_to_base',
    label: 'Number: decimal → base N',
    param: { label: 'To base (2-36)', initial: '16' },
  },
];

const enc = new TextEncoder();
export const textToBytes = (s: string) => enc.encode(s);
export const bytesToText = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(b);
export const bytesToHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

function fromBinaryString(s: string): Uint8Array {
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

function hexToBytes(raw: string): Uint8Array {
  const clean = raw.replace(/0x/gi, '').replace(/[\s:,-]/g, '');
  if (!/^[0-9a-f]*$/i.test(clean)) throw new Error('Not hex: use 0-9 and a-f only.');
  if (clean.length % 2) throw new Error('Hex needs an even number of digits.');
  return Uint8Array.from(clean.match(/../g) ?? [], (p) => parseInt(p, 16));
}

function parseBase(param: string): number {
  const base = Number(param);
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error('Base must be 2 to 36.');
  return base;
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
function parseInBase(token: string, base: number): number {
  const t = token.toLowerCase().replace(/^0[box]/, '');
  if (!t || [...t].some((ch) => DIGITS.indexOf(ch) < 0 || DIGITS.indexOf(ch) >= base)) {
    throw new Error(`"${token}" is not a base-${base} number.`);
  }
  return parseInt(t, base);
}

/** Runs one step. Throws an Error with a short message the page shows under that step. */
export function runStep(input: Uint8Array, op: OpId, param = ''): Uint8Array {
  const text = () => bytesToText(input);
  switch (op) {
    case 'from_base64': {
      let s = text().replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Not Base64.');
      s += '='.repeat((4 - (s.length % 4)) % 4);
      return fromBinaryString(atob(s));
    }
    case 'to_base64':
      return textToBytes(btoa(String.fromCharCode(...input)));
    case 'from_hex':
      return hexToBytes(text());
    case 'to_hex':
      return textToBytes(bytesToHex(input));
    case 'xor': {
      const key = /^0x[0-9a-f\s]+$/i.test(param.trim()) ? hexToBytes(param) : textToBytes(param);
      if (key.length === 0) throw new Error('Enter a key.');
      return input.map((b, i) => b ^ key[i % key.length]);
    }
    case 'rot': {
      const n = Number(param);
      if (!Number.isInteger(n)) throw new Error('Shift must be a whole number.');
      const k = ((n % 26) + 26) % 26;
      return textToBytes(
        text().replace(/[a-z]/gi, (c) => {
          const a = c <= 'Z' ? 65 : 97;
          return String.fromCharCode(((c.charCodeAt(0) - a + k) % 26) + a);
        }),
      );
    }
    case 'from_binary': {
      const bits = text().replace(/[\s,]/g, '');
      if (!/^[01]*$/.test(bits) || bits.length % 8)
        throw new Error('Binary must be groups of 8 bits.');
      return Uint8Array.from(bits.match(/.{8}/g) ?? [], (g) => parseInt(g, 2));
    }
    case 'to_binary':
      return textToBytes(Array.from(input, (b) => b.toString(2).padStart(8, '0')).join(' '));
    case 'url_decode':
      try {
        return textToBytes(decodeURIComponent(text().replace(/\+/g, ' ')));
      } catch {
        throw new Error('Not valid URL encoding.');
      }
    case 'reverse':
      return textToBytes([...text()].reverse().join(''));
    case 'base_to_dec': {
      const base = parseBase(param);
      const tokens = text()
        .split(/[\s,]+/)
        .filter(Boolean);
      return textToBytes(tokens.map((t) => String(parseInBase(t, base))).join(' '));
    }
    case 'dec_to_base': {
      const base = parseBase(param);
      const tokens = text()
        .split(/[\s,]+/)
        .filter(Boolean);
      return textToBytes(tokens.map((t) => parseInBase(t, 10).toString(base)).join(' '));
    }
  }
}
