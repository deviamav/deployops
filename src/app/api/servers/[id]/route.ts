import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { encryptSecret } from "@/lib/crypto";
import { getClientIp, logEvent } from "@/lib/audit";
import { checkHostForbidden, resolveAndCheckHost } from "@/lib/ssh";

const Schema = z.object({
  name: z.string().min(1).max(120).optional(),
  host: z.string().min(1).max(253).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(64).optional(),
  password: z.string().min(1).max(1024).optional(),
  notes: z.string().max(2000).nullable().optional(),
  setupId: z.string().nullable().optional(),
  ownerId: z.string().optional(),
});

async function load(id: string) {
  return prisma.server.findUnique({ where: { id } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await load(id);
    if (!cur) return notFound();
    const body = Schema.parse(await req.json());
    if (body.host !== undefined) {
      const hostErr = checkHostForbidden(body.host);
      if (hostErr) return badRequest(hostErr);
      try {
        await resolveAndCheckHost(body.host);
      } catch (err: any) {
        return badRequest(err?.message ?? "host validation failed");
      }
    }
    const data: any = { ...body };
    if (body.password) {
      data.passwordEncrypted = encryptSecret(body.password);
      delete data.password;
    }
    if (body.ownerId !== undefined) {
      const u = await prisma.user.findUnique({ where: { id: body.ownerId } });
      if (!u) return notFound("owner");
      data.ownerId = u.id;
    }
    await prisma.server.update({ where: { id }, data });
    await logEvent({ userId: me.id, action: "server.update", target: id, ip: getClientIp(req) });
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
    await prisma.server.delete({ where: { id } });
    await logEvent({ userId: me.id, action: "server.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
