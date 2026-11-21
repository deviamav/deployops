import { z } from "zod";
import { canEditAsset, canViewAssetCode, HttpError, requireSession } from "@/lib/rbac";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { loadAssetForRead, loadAssetForWrite } from "@/lib/asset-access";
import { isSafeInternalPath, isTextPath, readZipFile, writeZipFile } from "@/lib/zip-edit";
import { getClientIp, logEvent } from "@/lib/audit";

const MAX_TEXT_BYTES = 4 * 1024 * 1024;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  try {
    const me = await requireSession();
    if (!canViewAssetCode(me)) throw new HttpError(403, "forbidden");
    const { id, path: parts } = await ctx.params;
    const internal = parts.join("/");
    if (!isSafeInternalPath(internal)) return badRequest("unsafe path");
    const asset = await loadAssetForRead(me, "offer", id);
    const buf = readZipFile(asset.filePath, internal);
    if (!buf) return notFound();
    if (!isTextPath(internal)) {
      return ok({ binary: true, size: buf.length });
    }
    if (buf.length > MAX_TEXT_BYTES) return badRequest("file too large for editor");
    return ok({ binary: false, content: buf.toString("utf8") });
  } catch (e) {
    return handleError(e);
  }
}

const PutSchema = z.object({ content: z.string() });

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  try {
    const me = await requireSession();
    if (!canEditAsset(me)) throw new HttpError(403, "forbidden");
    const { id, path: parts } = await ctx.params;
    const internal = parts.join("/");
    if (!isSafeInternalPath(internal)) return badRequest("unsafe path");
    if (!isTextPath(internal)) return badRequest("not a text file");
    const asset = await loadAssetForWrite(me, "offer", id);
    const body = PutSchema.parse(await req.json());
    if (body.content.length > MAX_TEXT_BYTES) return badRequest("content too large");
    await writeZipFile(asset.filePath, internal, body.content);
    await logEvent({
      userId: me.id,
      action: "pack.edit",
      target: asset.id,
      meta: { path: internal, size: body.content.length },
      ip: getClientIp(req),
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
