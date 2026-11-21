import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

export async function GET() {
  try {
    const me = await requireSession();
    const where: any = {};
    if (me.role === "team_lead") where.id = me.groupId ?? "__none__";
    if (me.role === "buyer") where.id = me.groupId ?? "__none__";
    const groups = await prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        teamLead: true,
        _count: { select: { users: true, landings: true, offers: true } },
      },
    });
    return ok(groups);
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  name: z.string().min(1),
  teamLeadId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    const created = await prisma.group.create({
      data: { name: body.name, teamLeadId: body.teamLeadId || null },
    });
    if (body.teamLeadId) {
      await prisma.user.update({
        where: { id: body.teamLeadId },
        data: { groupId: created.id, role: "team_lead" },
      });
    }
    await logEvent({
      userId: me.id,
      action: "group.create",
      target: created.id,
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
