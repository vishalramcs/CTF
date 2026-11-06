import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { parseTeamRows } from '@/lib/admin/teams';
import { buildXlsx, readXlsx } from '@/lib/admin/xlsx';

// A zip with deflated entries and a shared-strings table, the way Excel itself saves.
function excelStyle(files: Record<string, string>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

describe('team list Excel', () => {
  it('reads back the template it writes', async () => {
    const rows = await readXlsx(
      buildXlsx([
        ['Team name', 'Password'],
        ['Web Slingers', 'pass & <1>'],
      ]),
    );
    expect(rows).toEqual([
      ['Team name', 'Password'],
      ['Web Slingers', 'pass & <1>'],
    ]);
  });

  it('reads a compressed Excel file with shared strings, numbers and gaps', async () => {
    const file = excelStyle({
      'xl/sharedStrings.xml':
        '<sst><si><t>Team name</t></si><si><t>Password</t></si><si><r><t>Venom</t></r><r><t> Squad</t></r></si><si><t>Nova</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>123456</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c></row></sheetData></worksheet>',
    });
    expect(await readXlsx(file)).toEqual([
      ['Team name', 'Password'],
      ['Venom Squad', '123456'],
      ['Nova'],
    ]);
  });

  it('turns rows into teams, skipping the header, with a password or the default', () => {
    expect(parseTeamRows('Team name\tPassword\nVenom Squad\t123456\nNova\n')).toEqual({
      rows: [
        { name: 'Venom Squad', password: '123456' },
        { name: 'Nova', password: null },
      ],
      errors: [],
    });
    expect(parseTeamRows('A1,abc').errors[0]).toMatch(/4–64/);
    expect(parseTeamRows('Nova\nnova').errors[0]).toMatch(/twice/);
  });
});
