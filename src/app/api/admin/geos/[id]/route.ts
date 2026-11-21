import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";
import { resolveStoredFlag } from "@/lib/geo-flag";

const Schema = z.object({
  name: z.string().optional(),
  flag: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const cur = await prisma.geo.findUnique({ where: { id } });
    if (!cur) return notFound();

    const data: { name?: string; flag?: string | null; active?: boolean } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.active !== undefined) data.active = body.active;
    if (body.flag !== undefined) {
      data.flag = resolveStoredFlag(body.flag, cur.code);
    }

    await prisma.geo.update({ where: { id }, data });
    await logEvent({ userId: me.id, action: "geo.update", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    await prisma.geo.delete({ where: { id } });
    await logEvent({ userId: me.id, action: "geo.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
