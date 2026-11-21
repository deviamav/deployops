import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok, notFound } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  name: z.string().optional(),
  notes: z.string().nullable().optional(),
  engine: z.enum(["palladium", "palladium_redirect", "cubbe"]).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const cur = await prisma.cloakerScript.findUnique({ where: { id } });
    if (!cur) return notFound();

    await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.cloakerScript.updateMany({
          where: { geoId: cur.geoId, isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.cloakerScript.update({
        where: { id },
        data: body,
      });
    });
    await logEvent({ userId: me.id, action: "script.update", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await prisma.cloakerScript.findUnique({ where: { id } });
    if (!cur) return notFound();
    await prisma.cloakerScript.delete({ where: { id } });
    await fs.unlink(cur.filePath).catch(() => {});
    await logEvent({ userId: me.id, action: "script.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
