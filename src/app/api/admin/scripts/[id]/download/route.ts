import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { contentDispositionAttachment, handleError, notFound } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await prisma.cloakerScript.findUnique({ where: { id } });
    if (!cur) return notFound();
    const data = await fs.readFile(cur.filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/x-httpd-php",
        "Content-Disposition": contentDispositionAttachment(`${cur.name || id}.php`),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
