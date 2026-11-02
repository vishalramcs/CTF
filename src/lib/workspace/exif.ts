// Just enough of EXIF for the sighting photos: reads tags from a JPEG's APP1 segment in the browser.
export type ExifFields = Record<string, string>;

const NAMES: Record<number, string> = {
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x9003: 'DateTimeOriginal',
  0x9011: 'OffsetTimeOriginal',
};
const GPS_NAMES: Record<number, string> = {
  1: 'GPSLatitudeRef',
  2: 'GPSLatitude',
  3: 'GPSLongitudeRef',
  4: 'GPSLongitude',
};
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

export function parseExif(buffer: ArrayBuffer): ExifFields {
  const view = new DataView(buffer);
  const fields: ExifFields = {};
  let at = 2;
  while (at + 4 <= view.byteLength && view.getUint8(at) === 0xff) {
    const marker = view.getUint8(at + 1);
    const size = view.getUint16(at + 2);
    if (marker === 0xe1 && view.getUint32(at + 4) === 0x45786966) {
      readTiff(view, at + 10, fields);
      break;
    }
    if (marker === 0xda) break; // image data starts: no EXIF came before it
    at += 2 + size;
  }
  return fields;
}

function readTiff(view: DataView, base: number, fields: ExifFields): void {
  const little = view.getUint16(base) === 0x4949;
  const u16 = (o: number) => view.getUint16(base + o, little);
  const u32 = (o: number) => view.getUint32(base + o, little);

  function value(type: number, count: number, entry: number): string {
    const size = (TYPE_SIZE[type] ?? 1) * count;
    const offset = size <= 4 ? entry + 8 : u32(entry + 8);
    if (type === 2) {
      let out = '';
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(base + offset + i);
        if (c === 0) break;
        out += String.fromCharCode(c);
      }
      return out;
    }
    if (type === 5) {
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const v = u32(offset + i * 8) / u32(offset + i * 8 + 4);
        parts.push(String(Math.round(v * 10000) / 10000));
      }
      return parts.join(', ');
    }
    return type === 3 ? String(u16(offset)) : String(u32(offset));
  }

  function readIfd(offset: number, names: Record<number, string>): void {
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const tag = u16(entry);
      if (tag === 0x8769) readIfd(u32(entry + 8), NAMES);
      else if (tag === 0x8825) readIfd(u32(entry + 8), GPS_NAMES);
      else if (names[tag]) fields[names[tag]] = value(u16(entry + 2), u32(entry + 4), entry);
    }
  }
  readIfd(u32(4), NAMES);
}
