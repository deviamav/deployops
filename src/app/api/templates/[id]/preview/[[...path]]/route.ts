import { requireSession } from "@/lib/rbac";
import { badRequest, handleError, notFound } from "@/lib/http";
import { loadAssetForRead } from "@/lib/asset-access";
import {
  dirPrefix,
  findIndexEntry,
  injectPreviewBase,
  isHtmlLike,
  isSafeInternalPath,
  mimeFromPath,
  readZipFile,
} from "@/lib/zip-edit";

/**
 * Preview-сервер для ZIP-asset'у.
 *   /api/templates/<id>/preview/                  → index.html/.php з ZIP
 *   /api/templates/<id>/preview/path/to/file.css  → конкретний файл з ZIP
 *
 * Якщо архів має єдину підпапку (напр. kaspi-ai/), вона стає префіксом
 * для resolve-у відносних шляхів — або через redirect, або через
 * <base href> інжектований у HTML.
 *
 * PHP-файли віддаються як HTML БЕЗ виконання (це pre-cloak preview).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path?: string[] }> },
) {
  try {
    const me = await requireSession();
    const { id, path: parts } = await ctx.params;
    const asset = await loadAssetForRead(me, "landing", id);

    const idxEntry = findIndexEntry(asset.filePath);
    const prefix = idxEntry ? dirPrefix(idxEntry) : "";

    let internal = (parts ?? []).join("/");
    if (!internal) {
      if (!idxEntry) return notFound("no index in archive");
      internal = idxEntry;
    }
    if (!isSafeInternalPath(internal)) return badRequest("unsafe path");

    let buf = readZipFile(asset.filePath, internal);
    // Якщо файл не знайдено і запит без префіксу — пробуємо з prefix архіву.
    if (!buf && prefix && !internal.startsWith(prefix)) {
      buf = readZipFile(asset.filePath, prefix + internal);
    }
    if (!buf) return notFound();

    const mime = mimeFromPath(internal);
    const isHtml = isHtmlLike(internal);
    const baseHref = `/api/templates/${id}/preview/${prefix}`;
    const body = isHtml
      ? injectPreviewBase(buf.toString("utf8"), baseHref)
      : new Uint8Array(buf);

    return new Response(body as any, {
      headers: {
        "Content-Type": mime,
        // SECURITY: preview-контент — НЕДОВІРЕНИЙ HTML/JS з ZIP. Без sandbox
        // зловмисний landing може через fetch('/api/admin/...') з cookie адміна
        // створити setup із shell-injection (див. H4 в audit). `sandbox` БЕЗ
        // allow-same-origin → документ отримує "opaque origin" → не має доступу
        // до cookies/storage панелі → admin-CSRF неможливий.
        "Content-Security-Policy":
          "sandbox allow-scripts allow-forms allow-popups; " +
          "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; " +
          "img-src * data: blob:; media-src * blob: data:; font-src * data:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "frame-ancestors 'self';",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
