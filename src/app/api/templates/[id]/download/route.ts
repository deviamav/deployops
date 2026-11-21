import fs from "node:fs/promises";
import { canDownloadAsset, HttpError, requireSession } from "@/lib/rbac";
import { contentDispositionAttachment, handleError } from "@/lib/http";
import { loadAssetForRead } from "@/lib/asset-access";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    if (!canDownloadAsset(me)) throw new HttpError(403, "forbidden");
    const { id } = await ctx.params;
    const asset = await loadAssetForRead(me, "landing", id);
    const data = await fs.readFile(asset.filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDispositionAttachment(
          asset.originalFilename || `${asset.name}.zip`,
        ),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
