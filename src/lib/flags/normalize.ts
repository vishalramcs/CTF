// Flags set before the prefix changed are stored under this one, and still have to match.
const LEGACY_PREFIX = 'EYE';

// TRD §8.1. Returns null for malformed input or a wrong prefix. Each prefix hashes differently, so
// the legacy one can't solve a question whose flag was set under the current one.
export function normalizeFlag(input: string, prefix: string): string | null {
  const match = input.trim().match(/^([A-Za-z0-9_]+)\{(.*)\}$/s);
  if (!match) return null;
  const given = match[1].toUpperCase();
  const canonical =
    given === prefix.toUpperCase() ? prefix : given === LEGACY_PREFIX ? LEGACY_PREFIX : null;
  return canonical && `${canonical}{${match[2].trim().toLowerCase()}}`;
}
