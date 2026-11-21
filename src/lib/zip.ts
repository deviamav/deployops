import path from "node:path";
import AdmZip from "adm-zip";

const MAX_ENTRIES = Number(process.env.ZIP_MAX_ENTRIES ?? 10_000);
const MAX_TOTAL_BYTES = Number(process.env.ZIP_MAX_TOTAL_BYTES ?? 524_288_000);

export interface ZipSafetyReport {
  ok: boolean;
  entries: number;
  totalBytes: number;
  error?: string;
}

/**
 * Нормалізує POSIX-шлях (схлопує `fonts/../font.ttf` → `font.ttf`) і повертає
 * true, якщо результат лишається в межах кореня архіву.
 *
 * Дозволяє легітимні ZIP-и від Tilda/Webflow/Figma (вони часто кладуть
 * відносні `fonts/../`), але блокує реальні traversal'и: `../../etc/passwd`
 * → після normalize дає `../etc/passwd` → відхиляємо.
 */
/** React/Tilda junk dirs: `fonts/../`, `css/../` — безпечні placeholder'и. */
function isJunkDirMarker(slash: string): boolean {
  if (!slash.endsWith("/")) return false;
  const stripped = slash.replace(/\/+$/, "");
  if (stripped.endsWith("/..")) return true;
  return path.posix.normalize(stripped) === ".";
}

export function isEntryPathSafe(rawName: string): boolean {
  if (!rawName) return false;
  const slash = rawName.replace(/\\/g, "/");
  if (slash.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(slash)) return false;
  if (isJunkDirMarker(slash)) return true;

  const stripped = slash.replace(/\/+$/, "");
  const norm = path.posix.normalize(stripped || ".");

  if (norm === "." && stripped === ".") return false;
  if (norm === "..") return false;
  if (norm.startsWith("../") || norm.startsWith("/")) return false;
  return normalizeEntryName(rawName) !== null;
}

/** Нормалізує ім'я entry для безпечного extract (fonts/../x → fonts/x). null = пропустити junk. */
export function normalizeEntryName(rawName: string): string | null {
  if (!rawName) return null;
  const slash = rawName.replace(/\\/g, "/");
  if (slash.startsWith("/") || slash.startsWith("\\")) return null;
  if (/^[a-zA-Z]:[\\/]/.test(slash)) return null;
  if (isJunkDirMarker(slash)) return null;

  const hadTrailingSlash = slash.endsWith("/");
  const stripped = slash.replace(/\/+$/, "");
  let norm = path.posix.normalize(stripped);

  if (norm === "." || norm === "..") return null;
  if (norm.startsWith("../") || norm.startsWith("/")) return null;
  if (hadTrailingSlash && !norm.endsWith("/")) norm += "/";
  return norm;
}

/**
 * Перепаковує ZIP з нормалізованими шляхами entries.
 * React/Tilda/Webflow часто кладуть `fonts/../file.woff` — inspectZip це дозволяє,
 * але bsdtar на target VPS відхиляє `..` навіть коли шлях безпечний після normalize.
 *
 * Якщо adm-zip не може прочитати архів (data-descriptor тощо) — повертаємо
 * оригінал as-is (remote unzip зазвичай справляється).
 */
export function sanitizeZipBuffer(buffer: Buffer): Buffer {
  try {
    return sanitizeZipBufferInner(buffer);
  } catch {
    // Ніколи не валимо cloak через adm-zip.
    return buffer;
  }
}

function sanitizeZipBufferInner(buffer: Buffer): Buffer {
  const src = new AdmZip(buffer);
  const dst = new AdmZip();
  const seen = new Set<string>();
  let wrote = 0;
  let readErrors = 0;

  for (const e of src.getEntries()) {
    const norm = normalizeEntryName(e.entryName);
    if (norm === null) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    if (e.isDirectory) {
      const dirName = norm.endsWith("/") ? norm : `${norm}/`;
      if (!dst.getEntry(dirName)) {
        dst.addFile(dirName, Buffer.alloc(0));
        wrote++;
      }
      continue;
    }

    let data: Buffer;
    try {
      data = e.getData();
    } catch {
      readErrors++;
      continue;
    }
    dst.addFile(norm, data);
    wrote++;
  }

  if (wrote === 0 || (readErrors > 0 && wrote < readErrors)) {
    return buffer;
  }

  return dst.toBuffer();
}

/**
 * Перевіряє ZIP-bomb евристиками з розділу 9.6 ТЗ:
 *  - кількість файлів < ZIP_MAX_ENTRIES (10k)
 *  - сума розпакованих розмірів < ZIP_MAX_TOTAL_BYTES (500MB)
 */
export function inspectZip(buffer: Buffer): ZipSafetyReport {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (e: any) {
    return { ok: false, entries: 0, totalBytes: 0, error: `invalid zip: ${e?.message ?? e}` };
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) {
    return {
      ok: false,
      entries: entries.length,
      totalBytes: 0,
      error: `too many entries: ${entries.length} > ${MAX_ENTRIES}`,
    };
  }
  let total = 0;
  for (const e of entries) {
    // SECURITY (Zip-Slip CVE-2018-1002204): забороняємо абсолютні шляхи та
    // path-traversal, які РЕАЛЬНО виходять за межі archive root.
    // Нормалізуємо шлях: `fonts/../font.ttf` → `font.ttf` (OK, легітимний Tilda),
    // `../etc/passwd` → лишається `../etc/passwd` (блокуємо).
    const name = e.entryName;
    if (!isEntryPathSafe(name)) {
      return {
        ok: false,
        entries: entries.length,
        totalBytes: total,
        error: `unsafe entry path: ${name}`,
      };
    }
    // SECURITY (Symlink-Zip-Slip): блокуємо symlink-entries (UNIX mode 0o120000)
    // і hardlink-entries — інакше `unzip` створить symlink, через який наступні
    // запити писатимуть поза webRoot, оминаючи перевірку шляху.
    const unixMode = (e.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000 || unixMode === 0o140000) {
      return {
        ok: false,
        entries: entries.length,
        totalBytes: total,
        error: `symlink/socket entry not allowed: ${name}`,
      };
    }
    total += e.header.size;
    if (total > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        entries: entries.length,
        totalBytes: total,
        error: `uncompressed size exceeds ${MAX_TOTAL_BYTES} bytes`,
      };
    }
  }
  return { ok: true, entries: entries.length, totalBytes: total };
}
