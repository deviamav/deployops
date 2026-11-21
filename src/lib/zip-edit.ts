import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

export interface ZipEntry {
  path: string;
  isDir: boolean;
  size: number;
  mtime: string | null;
}

const TEXT_EXTS = new Set([
  ".php", ".html", ".htm", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx",
  ".json", ".xml", ".svg", ".txt", ".md", ".env", ".yml", ".yaml", ".sh",
  ".conf", ".ini", ".sql",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".php": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export function mimeFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function isTextPath(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return TEXT_EXTS.has(ext);
}

/** Список усіх не-директорних entry'ів у ZIP. */
export function listZipEntries(zipPath: string): ZipEntry[] {
  const zip = new AdmZip(zipPath);
  return zip
    .getEntries()
    .map<ZipEntry>((e) => ({
      path: e.entryName,
      isDir: e.isDirectory,
      size: e.header.size,
      mtime: e.header.time?.toISOString() ?? null,
    }))
    .filter((e) => !e.isDir)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function readZipFile(zipPath: string, internalPath: string): Buffer | null {
  const zip = new AdmZip(zipPath);
  const norm = normalizeInternalPath(internalPath);
  const entry = zip.getEntry(norm);
  if (!entry) {
    // спроба знайти case-insensitive і без leading slash
    const all = zip.getEntries();
    const lc = norm.toLowerCase();
    const m = all.find((x) => x.entryName.toLowerCase() === lc);
    if (!m) return null;
    return m.getData();
  }
  if (entry.isDirectory) return null;
  return entry.getData();
}

/**
 * Перезаписує файл усередині ZIP. Якщо файлу немає — додає.
 * Зберігає zip на диск atomically (через tmp + rename).
 */
export async function writeZipFile(
  zipPath: string,
  internalPath: string,
  content: Buffer | string,
): Promise<void> {
  const zip = new AdmZip(zipPath);
  const norm = normalizeInternalPath(internalPath);
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const existing = zip.getEntry(norm);
  if (existing) {
    if (existing.isDirectory) throw new Error("cannot overwrite directory entry");
    zip.updateFile(norm, buf);
  } else {
    zip.addFile(norm, buf);
  }
  const tmp = `${zipPath}.tmp-${Date.now()}`;
  await new Promise<void>((resolve, reject) =>
    zip.writeZip(tmp, (err) => (err ? reject(err) : resolve())),
  );
  await fs.rename(tmp, zipPath);
}

function normalizeInternalPath(p: string): string {
  let s = p.replace(/\\/g, "/").replace(/^\.\/?/, "");
  while (s.startsWith("/")) s = s.slice(1);
  return s;
}

/** Безпечна перевірка від path-traversal: лише plain-сегменти. */
export function isSafeInternalPath(p: string): boolean {
  const norm = normalizeInternalPath(p);
  if (!norm) return false;
  return norm.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * Знаходить кращий "індексний" entry у ZIP (для preview):
 * шукає index.html / index.php у корені або в єдиній підпапці.
 */
export function findIndexEntry(zipPath: string): string | null {
  const zip = new AdmZip(zipPath);
  const candidates = ["index.html", "index.htm", "index.php"];
  const all = zip.getEntries().filter((e) => !e.isDirectory);
  for (const c of candidates) {
    const direct = all.find((e) => e.entryName.toLowerCase() === c);
    if (direct) return direct.entryName;
  }
  // одна спільна підпапка?
  const tops = new Set(all.map((e) => e.entryName.split("/")[0]));
  if (tops.size === 1) {
    const prefix = [...tops][0];
    for (const c of candidates) {
      const inSub = all.find(
        (e) => e.entryName.toLowerCase() === `${prefix.toLowerCase()}/${c}`,
      );
      if (inSub) return inSub.entryName;
    }
  }
  return null;
}

/**
 * Повертає префікс (директорію) для індексного entry, з кінцевим "/".
 * Якщо index у корені — повертає "".
 *   "kaspi-ai/index.html" → "kaspi-ai/"
 *   "index.html"          → ""
 */
export function dirPrefix(internalPath: string): string {
  const i = internalPath.lastIndexOf("/");
  return i < 0 ? "" : internalPath.slice(0, i + 1);
}

/**
 * Інжектить `<base href>` у HTML, щоб відносні шляхи (./assets/x.css)
 * правильно резолвилися від preview-кореня з префіксом архіву.
 */
export function injectPreviewBase(html: string, baseHref: string): string {
  const baseTag = `<base href="${escapeAttr(baseHref)}">`;
  // Уникаємо подвійних інжектів.
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${baseTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1>\n<head>${baseTag}</head>`,
    );
  }
  return `<!doctype html>\n<head>${baseTag}</head>\n${html}`;
}

function escapeAttr(s: string): string {
  return s.replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Чи це HTML/PHP-файл, який доречно інжектити <base>. */
export function isHtmlLike(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return ext === ".html" || ext === ".htm" || ext === ".php";
}
