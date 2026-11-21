/** ISO-3166-1 alpha-2 → regional indicator emoji (fallback). */
export function flagFromCode(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🏳";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳";
  const A = 0x1f1e6;
  return String.fromCodePoint(upper.charCodeAt(0) - 65 + A, upper.charCodeAt(1) - 65 + A);
}

export function normalizeGeoCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

/** PNG-прапор через CDN — працює на Windows/Linux/macOS (emoji часто показує "CA" замість 🇨🇦). */
export function flagCdnUrl(code: string | null | undefined, width = 40): string | null {
  const iso = normalizeGeoCode(code);
  if (!iso) return null;
  return `https://flagcdn.com/w${width}/${iso.toLowerCase()}.png`;
}

/** Emoji fallback (Apple/macOS). На Windows краще flagCdnUrl(). */
export function geoFlag(flag: string | null | undefined, code: string | null | undefined): string {
  if (flag && flag.length > 1 && !/^[A-Za-z]{2,3}$/.test(flag.trim())) {
    return flag;
  }
  return flagFromCode(code);
}

/** Нормалізує flag для збереження в БД: якщо передали ISO-код або порожньо — emoji з code. */
export function resolveStoredFlag(
  flag: string | null | undefined,
  code: string,
): string | null {
  const trimmed = flag?.trim();
  if (trimmed && !/^[A-Za-z]{2,3}$/.test(trimmed)) {
    return trimmed;
  }
  const emoji = flagFromCode(code);
  return emoji === "🏳" ? null : emoji;
}
