import { canViewAssetCode, HttpError, requireSession } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { loadAssetForRead } from "@/lib/asset-access";
import { findIndexEntry, listZipEntries } from "@/lib/zip-edit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    if (!canViewAssetCode(me)) throw new HttpError(403, "forbidden");
    const { id } = await ctx.params;
    const asset = await loadAssetForRead(me, "offer", id);
    const entries = listZipEntries(asset.filePath);
    return ok({
      asset: {
        id: asset.id,
        name: asset.name,
        originalFilename: asset.originalFilename,
        sizeBytes: asset.sizeBytes,
      },
      entries,
      indexEntry: findIndexEntry(asset.filePath),
    });
  } catch (e) {
    return handleError(e);
  }
}
