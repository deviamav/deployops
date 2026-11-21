export interface ParsedDomainRow {
  name: string;
  lineNo: number;
  raw: string;
  error?: string;
}

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Парсить вміст domains.txt (формат 5.2): 1 домен на рядок.
 * Порожні рядки та коментарі (`#`) ігноруються.
 */
export function parseDomainsTxt(text: string): ParsedDomainRow[] {
  return text
    .split(/\r?\n/)
    .map<ParsedDomainRow | null>((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (!line || line.startsWith("#")) return null;
      if (!DOMAIN_RE.test(line)) {
        return { raw, lineNo, name: line, error: "invalid domain" };
      }
      return { raw, lineNo, name: line };
    })
    .filter((x): x is ParsedDomainRow => x !== null);
}
