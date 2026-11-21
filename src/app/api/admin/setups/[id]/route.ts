import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireRole } from "@/lib/rbac";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  name: z.string().min(1).max(120).optional(),
  // SECURITY: див. POST /api/admin/setups — обмеження проти shell injection.
  webRootTemplate: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^\/[a-zA-Z0-9._{}/-]+$/,
      "webRootTemplate: абсолютний шлях, дозволені [a-zA-Z0-9._{}/-]",
    )
    .refine((s) => !s.includes(".."), "webRootTemplate: '..' заборонено")
    .optional(),
  webUser: z
    .string()
    .regex(
      /^[a-z_][a-z0-9_-]{0,31}$/,
      "webUser: [a-z_][a-z0-9_-]{0,31} (POSIX user name)",
    )
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const cur = await prisma.serverSetup.findUnique({ where: { id } });
    if (!cur) return notFound();
    const body = Schema.parse(await req.json());
    if (body.webRootTemplate !== undefined && !body.webRootTemplate.includes("{domain}")) {
      return badRequest("webRootTemplate must contain {domain}");
    }
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.webRootTemplate !== undefined) data.webRootTemplate = body.webRootTemplate;
    if (body.webUser !== undefined) data.webUser = body.webUser?.trim() || null;
    await prisma.serverSetup.update({ where: { id }, data });
    await logEvent({
      userId: me.id,
      action: "setup.update",
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
    const cur = await prisma.serverSetup.findUnique({
      where: { id },
      include: { _count: { select: { servers: true } } },
    });
    if (!cur) return notFound();
    if (cur.isBuiltin) throw new HttpError(400, "не можна видалити вбудований сетап");
    if (cur._count.servers > 0)
      throw new HttpError(400, `використовується на ${cur._count.servers} сервері(ах)`);
    await prisma.serverSetup.delete({ where: { id } });
    await logEvent({
      userId: me.id,
      action: "setup.delete",
      target: id,
      meta: { key: cur.key },
      ip: getClientIp(req),
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
