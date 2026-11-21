import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canDeleteAsset, canEditAsset, canMutate, HttpError, requireSession } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  geoId: z.string().min(1).optional(),
  groupId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    if (me.role !== "admin" && me.role !== "team_lead" && !canEditAsset(me))
      throw new HttpError(403, "forbidden");
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const cur = await prisma.landing.findUnique({ where: { id } });
    if (!cur) return notFound();
    if (!canMutate(me, { ownerId: cur.uploadedById, groupId: cur.groupId }))
      throw new HttpError(403, "forbidden");

    const updated = await prisma.landing.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.geoId !== undefined ? { geoId: body.geoId } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      },
    });
    await logEvent({
      userId: me.id,
      action: "template.update",
      target: id,
      meta: body,
      ip: getClientIp(req),
    });
    return ok({ id: updated.id });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    if (!canDeleteAsset(me)) throw new HttpError(403, "forbidden");
    const { id } = await ctx.params;
    const cur = await prisma.landing.findUnique({ where: { id } });
    if (!cur) return notFound();
    if (!canMutate(me, { ownerId: cur.uploadedById, groupId: cur.groupId }))
      throw new HttpError(403, "forbidden");
    await prisma.landing.delete({ where: { id } });
    await fs.unlink(cur.filePath).catch(() => {});
    await logEvent({ userId: me.id, action: "template.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
