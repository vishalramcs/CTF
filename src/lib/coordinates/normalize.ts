// Answers for a city or place compare loosely, so `  Coimbatore. ` and `COIMBATORE` match. Only
// Latin diacritics go: \p{M} would also strip the vowel signs of Indian scripts.
// A place may be named in full ("TOKYO, JAPAN") or by its city alone ("Tokyo", "New York City").
export function placeMatches(given: string, label: string): boolean {
  const g = normalizeLocation(given);
  if (!g) return false;
  // Spaces dropped so "U.K." and "UK", or "NewYork" and "New York", compare equal.
  const squash = (s: string | null) => s?.replace(/ /g, '') ?? null;
  const accepted = [label, label.split(',')[0]].map((s) => squash(normalizeLocation(s)));
  return [g, g.replace(/ city$/, '')].some((x) => accepted.includes(squash(x)));
}

export function normalizeLocation(input: string): string | null {
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
  return normalized || null;
}
