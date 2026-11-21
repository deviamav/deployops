export interface ParsedServerRow {
  host: string;
  password: string;
  domains: string[];
  lineNo: number;
  raw: string;
  error?: string;
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function validIpOctets(ip: string): boolean {
  return ip.split(".").every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/**
 * Парсить вміст servers.txt (формат 5.1):
 *   <IP>\t<PASSWORD>\t<DOMAIN1> <DOMAIN2> ...
 *
 * - порожні рядки і ті, що починаються з `#` — ігноруються
 * - 3-тє поле необов'язкове (домени)
 */
export function parseServersTxt(text: string): ParsedServerRow[] {
  return text
    .split(/\r?\n/)
    .map<ParsedServerRow | null>((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (!line || line.startsWith("#")) return null;
      const parts = line.split(/\t+/);
      if (parts.length < 2) {
        return {
          raw,
          lineNo,
          host: "",
          password: "",
          domains: [],
          error: "expected 2-3 tab-separated fields",
        };
      }
      const [host, password, domStr = ""] = parts;
      if (!IP_RE.test(host) || !validIpOctets(host)) {
        return { raw, lineNo, host, password, domains: [], error: "invalid IP" };
      }
      if (!password) {
        return { raw, lineNo, host, password, domains: [], error: "missing password" };
      }
      const domains = domStr.split(/\s+/).filter(Boolean);
      const bad = domains.find((d) => !DOMAIN_RE.test(d));
      if (bad) {
        return { raw, lineNo, host, password, domains, error: `invalid domain: ${bad}` };
      }
      return { raw, lineNo, host, password, domains };
    })
    .filter((x): x is ParsedServerRow => x !== null);
}
