// Answers for a city or place compare loosely, so `  Coimbatore. ` and `COIMBATORE` match. Only
// Latin diacritics go: \p{M} would also strip the vowel signs of Indian scripts.
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
