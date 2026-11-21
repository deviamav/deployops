import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z
  .object({
    serverId: z.string().optional(),
    name: z.string().optional(),
    webRoot: z
      .string()
      .max(255)
      .regex(/^\/[A-Za-z0-9._\-/]+$/u, "absolute posix path required")
      .refine((s) => !s.includes(".."), "no '..' allowed")
      .optional(),
    cloakType: z.enum(["offer_only", "land_offer"]).optional(),
    status: z.enum(["pending", "deployed", "failed"]).optional(),
    ownerId: z.string().optional(),
  })
  .strict();

async function load(id: string) {
  return prisma.domain.findUnique({ where: { id } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await load(id);
    if (!cur) return notFound();
    const body = Schema.parse(await req.json());
    const data: any = {};
    if (body.serverId !== undefined) {
      const s = await prisma.server.findUnique({ where: { id: body.serverId } });
      if (!s) return notFound("server");
      data.serverId = s.id;
    }
    if (body.ownerId !== undefined) {
      const u = await prisma.user.findUnique({ where: { id: body.ownerId } });
      if (!u) return notFound("owner");
      data.ownerId = u.id;
    }
    if (body.name !== undefined) data.name = body.name;
    if (body.webRoot !== undefined) data.webRoot = body.webRoot;
    if (body.cloakType !== undefined) data.cloakType = body.cloakType;
    if (body.status !== undefined) data.status = body.status;
    await prisma.domain.update({ where: { id }, data });
    await logEvent({ userId: me.id, action: "domain.update", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await load(id);
    if (!cur) return notFound();
    await prisma.domain.delete({ where: { id } });
    await logEvent({ userId: me.id, action: "domain.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
