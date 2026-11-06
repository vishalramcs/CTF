import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeFlag } from '@/lib/flags/normalize';
import { openMessage, sealMessage } from '@/lib/vault/crypto';
import { parseExif } from '@/lib/workspace/exif';
import { asciiOf, parsePcapng } from '@/lib/workspace/pcap';

const bytesOf = (path: string) => {
  const file = readFileSync(`src/lib/workspace/files/${path}`);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
};

describe('the four-key seal', () => {
  const keys = ['alpha', 'bravo', 'charlie', 'delta'];

  it('opens with all four keys in order', async () => {
    const sealed = await sealMessage(keys, 'hello');
    expect(await openMessage(keys, sealed)).toBe('hello');
  });

  it('stays shut with a wrong, missing or misplaced key', async () => {
    const sealed = await sealMessage(keys, 'hello');
    expect(await openMessage(['alpha', 'bravo', 'charlie', 'nope'], sealed)).toBeNull();
    expect(await openMessage(['alpha', 'bravo', 'charlie', ''], sealed)).toBeNull();
    expect(await openMessage(['bravo', 'alpha', 'charlie', 'delta'], sealed)).toBeNull();
    expect(await openMessage(['alphab', 'ravo', 'charlie', 'delta'], sealed)).toBeNull();
  });
});

describe('the legacy flag prefix', () => {
  it('keeps its own hash input, so it can only match a flag set under it', () => {
    expect(normalizeFlag('eye{Old}', 'SPIDEY')).toBe('EYE{old}');
    expect(normalizeFlag('spidey{New}', 'SPIDEY')).toBe('SPIDEY{new}');
  });
});

describe('the evidence viewers read the real files', () => {
  it('reads a photo the way the tracker question needs', () => {
    const fields = parseExif(bytesOf('q8-sightings/sighting_photo_03.jpg'));
    expect(fields.DateTimeOriginal).toBe('2026:10:18 23:32:10');
    expect(fields.OffsetTimeOriginal).toBe('+09:00');
    expect(fields.GPSLatitudeRef).toBe('N');
  });

  it('lists the capture, with exactly one response from the unknown server carrying a route', () => {
    const packets = parsePcapng(bytesOf('q9-capture/network_capture.pcapng'));
    expect(packets.length).toBeGreaterThan(100);
    const hits = packets.filter(
      (p) => p.src === '203.0.113.140' && asciiOf(p.payload).includes('"route"'),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].time.startsWith('03:12')).toBe(true);
  });
});
