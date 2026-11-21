import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  name: z.string().min(1).optional(),
  teamLeadId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.teamLeadId !== undefined) data.teamLeadId = body.teamLeadId || null;
    const g = await prisma.group.update({ where: { id }, data });
    if (body.teamLeadId) {
      await prisma.user.update({
        where: { id: body.teamLeadId },
        data: { groupId: g.id, role: "team_lead" },
      });
    }
    await logEvent({
      userId: me.id,
      action: "group.update",
      target: id,
      ip: getClientIp(req),
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    await prisma.group.delete({ where: { id } });
    await logEvent({
      userId: me.id,
      action: "group.delete",
      target: id,
      ip: getClientIp(req),
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
