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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path?: string[] }> },
) {
  try {
    const me = await requireSession();
    const { id, path: parts } = await ctx.params;
    const asset = await loadAssetForRead(me, "offer", id);

    const idxEntry = findIndexEntry(asset.filePath);
    const prefix = idxEntry ? dirPrefix(idxEntry) : "";

    let internal = (parts ?? []).join("/");
    if (!internal) {
      if (!idxEntry) return notFound("no index in archive");
      internal = idxEntry;
    }
    if (!isSafeInternalPath(internal)) return badRequest("unsafe path");

    let buf = readZipFile(asset.filePath, internal);
    if (!buf && prefix && !internal.startsWith(prefix)) {
      buf = readZipFile(asset.filePath, prefix + internal);
    }
    if (!buf) return notFound();

    const mime = mimeFromPath(internal);
    const isHtml = isHtmlLike(internal);
    const baseHref = `/api/packs/${id}/preview/${prefix}`;
    const body = isHtml
      ? injectPreviewBase(buf.toString("utf8"), baseHref)
      : new Uint8Array(buf);

    return new Response(body as any, {
      headers: {
        "Content-Type": mime,
        // SECURITY: див. /api/templates/[id]/preview — sandbox без allow-same-origin
        // ізолює недовірений HTML від cookies/storage панелі.
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
