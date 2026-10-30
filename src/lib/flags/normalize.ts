// TRD §8.1. Returns null for malformed input or a wrong prefix.
export function normalizeFlag(input: string, prefix: string): string | null {
  const match = input.trim().match(/^([A-Za-z0-9_]+)\{(.*)\}$/s);
  if (!match || match[1].toLowerCase() !== prefix.toLowerCase()) return null;
  return `${prefix}{${match[2].trim().toLowerCase()}}`;
}
