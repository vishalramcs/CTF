// Reads a little-endian pcapng of Ethernet/IPv4 frames in the browser, which is what the challenge
// captures are.
// shortcut: other link types and big-endian captures are skipped, add them if a capture needs them.
export type Packet = {
  no: number;
  time: string; // UTC, HH:MM:SS.mmm
  src: string;
  dst: string;
  proto: 'TCP' | 'UDP' | 'IP';
  srcPort: number | null;
  dstPort: number | null;
  payload: Uint8Array;
};

const ENHANCED_PACKET = 6;

export function parsePcapng(buffer: ArrayBuffer): Packet[] {
  const view = new DataView(buffer);
  const packets: Packet[] = [];
  let at = 0;
  while (at + 12 <= view.byteLength) {
    const type = view.getUint32(at, true);
    const total = view.getUint32(at + 4, true);
    if (total < 12) break;
    if (type === ENHANCED_PACKET) {
      const micros = view.getUint32(at + 12, true) * 2 ** 32 + view.getUint32(at + 16, true);
      const captured = view.getUint32(at + 20, true);
      const packet = readFrame(buffer, at + 28, captured, packets.length + 1, micros);
      if (packet) packets.push(packet);
    }
    at += total;
  }
  return packets;
}

function readFrame(
  buffer: ArrayBuffer,
  start: number,
  length: number,
  no: number,
  micros: number,
): Packet | null {
  const view = new DataView(buffer, start, length);
  if (length < 34 || view.getUint16(12) !== 0x0800) return null;
  const headerLength = (view.getUint8(14) & 0x0f) * 4;
  const protocol = view.getUint8(23);
  const ip = (o: number) =>
    [0, 1, 2, 3].map((i) => view.getUint8(14 + o + i)).join('.');
  const l4 = 14 + headerLength;
  const hasPorts = protocol === 6 || protocol === 17;
  const dataAt =
    protocol === 6 ? l4 + (view.getUint8(l4 + 12) >> 4) * 4 : protocol === 17 ? l4 + 8 : l4;
  return {
    no,
    time: new Date(micros / 1000).toISOString().slice(11, 23),
    src: ip(12),
    dst: ip(16),
    proto: protocol === 6 ? 'TCP' : protocol === 17 ? 'UDP' : 'IP',
    srcPort: hasPorts ? view.getUint16(l4) : null,
    dstPort: hasPorts ? view.getUint16(l4 + 2) : null,
    payload: new Uint8Array(buffer, start + dataAt, length - dataAt),
  };
}

// Printable text, with anything else as a dot, like the text column of a packet tool.
export function asciiOf(bytes: Uint8Array): string {
  return Array.from(bytes, (b) =>
    b === 10 || b === 13 ? String.fromCharCode(b) : b >= 32 && b < 127 ? String.fromCharCode(b) : '.',
  ).join('');
}
