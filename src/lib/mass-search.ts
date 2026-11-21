/**
 * Масовий пошук: paste списку доменів/IP (рядки, коми, ;, пробіли)
 * → токени для OR-фільтрації.
 */
export function parseSearchTokens(raw: string): string[] {
  const parts = raw
    .split(/[\n\r,;\t ]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // unique, порядок зберігаємо
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** true якщо будь-який haystack містить або дорівнює будь-якому токену. */
export function matchesSearchTokens(
  haystacks: Array<string | null | undefined>,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const fields = haystacks
    .filter((h): h is string => typeof h === "string" && h.length > 0)
    .map((h) => h.toLowerCase());
  if (fields.length === 0) return false;

  return tokens.some((token) =>
    fields.some((f) => {
      if (f === token) return true;
      if (f.includes(token)) return true;
      // domain.com vs www.domain.com / subdomain
      if (token.includes(".") && (f === token || f.endsWith(`.${token}`))) return true;
      return false;
    }),
  );
}
