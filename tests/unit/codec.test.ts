import { describe, expect, it } from 'vitest';

import { bytesToText, runStep, textToBytes, type OpId } from '@/lib/tools/codec';

const chain = (input: string, ...steps: [OpId, string?][]) =>
  bytesToText(steps.reduce<Uint8Array>((b, [op, p]) => runStep(b, op, p), textToBytes(input)));

describe('Code Space steps', () => {
  it('decodes hex that holds Base64, as in the Main Question payloads', () => {
    const payload = Buffer.from(Buffer.from('WEB').toString('base64')).toString('hex');
    expect(chain(payload, ['from_hex'], ['from_base64'])).toBe('WEB');
  });

  it('round-trips Base64, hex and binary', () => {
    expect(chain('Spidey', ['to_base64'], ['from_base64'])).toBe('Spidey');
    expect(chain('Spidey', ['to_hex'], ['from_hex'])).toBe('Spidey');
    expect(chain('Spidey', ['to_binary'], ['from_binary'])).toBe('Spidey');
    expect(chain('U3BpZGV5', ['from_base64'])).toBe('Spidey'); // no padding needed
  });

  it('XORs with a text or hex key, and XOR twice gives the input back', () => {
    expect(chain('peter', ['xor', 'k'], ['xor', 'k'])).toBe('peter');
    expect(chain('A', ['xor', '0x20'])).toBe('a');
  });

  it('shifts letters only', () => {
    expect(chain('Uryyb, Jbeyq!', ['rot', '13'])).toBe('Hello, World!');
    expect(chain('abc', ['rot', '-1'])).toBe('zab');
  });

  it('converts number bases, for octal sensor readings', () => {
    expect(chain('2676 2746', ['base_to_dec', '8'])).toBe('1470 1510');
    expect(chain('255', ['dec_to_base', '16'])).toBe('ff');
    expect(() => chain('9', ['base_to_dec', '8'])).toThrow(/base-8/);
  });

  it('reports bad input instead of guessing', () => {
    expect(() => chain('zz', ['from_hex'])).toThrow(/hex/i);
    expect(() => chain('abc', ['from_hex'])).toThrow(/even/);
    expect(() => chain('%%%', ['from_base64'])).toThrow(/Base64/);
    expect(() => chain('x', ['xor', ''])).toThrow(/key/);
  });
});
