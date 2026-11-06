import { describe, expect, it } from 'vitest';

import { fileType, WORKSPACE_NAME } from '@/lib/workspace/uploaded';

describe('uploaded workspace names', () => {
  it('accepts plain file names with a known type', () => {
    expect(fileType('evidence_1.png')).toMatchObject({ kind: 'image' });
    expect(fileType('photo.JPG')).toMatchObject({ kind: 'exif' });
    expect(fileType('capture.pcapng')).toMatchObject({ kind: 'pcap' });
  });

  it('refuses paths, hidden files and unknown types', () => {
    for (const bad of ['../x.png', 'a/b.png', '.env', 'run.exe', 'page.html', 'x.svg', '']) {
      expect(fileType(bad)).toBeUndefined();
    }
  });

  it('keeps folder names to lowercase slugs', () => {
    expect(WORKSPACE_NAME.test('q14-lab')).toBe(true);
    for (const bad of ['Q14', '../x', 'a', 'has space', '-lead']) {
      expect(WORKSPACE_NAME.test(bad)).toBe(false);
    }
  });
});
