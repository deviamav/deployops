import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";
import { DEFAULT_WEB_ROOT_TEMPLATE, renderWebRoot } from "@/lib/server-setup";

export async function GET(req: Request) {
  try {
    const me = await requireSession();
    const url = new URL(req.url);
    const serverId = url.searchParams.get("serverId") ?? undefined;
    const where: any = { ...visibilityWhere(me, "domain") };
    if (serverId) where.serverId = serverId;
    // SECURITY: never return Server.passwordEncrypted — not even the ciphertext.
    // If DEPLOYOPS_SECRET_KEY leaks (backup / snapshot), all SSH passwords can be decrypted.
    const items = await prisma.domain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            host: true,
            port: true,
            username: true,
            setup: {
              select: {
                id: true,
                key: true,
                name: true,
                webRootTemplate: true,
                webUser: true,
              },
            },
          },
        },
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z
  .object({
    serverId: z.string().min(1),
    name: z.string().min(1).max(253),
    webRoot: z
      .string()
      .max(255)
      .regex(/^\/[A-Za-z0-9._\-/]+$/u, "absolute posix path required")
      .refine((s) => !s.includes(".."), "no '..' allowed")
      .optional(),
    cloakType: z.enum(["offer_only", "land_offer"]),
    ownerId: z.string().optional(),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    const srv = await prisma.server.findUnique({
      where: { id: body.serverId },
      include: { setup: true },
    });
    if (!srv) return notFound("server");
    let ownerId = me.id;
    if (body.ownerId) {
      const u = await prisma.user.findUnique({ where: { id: body.ownerId } });
      if (!u) return notFound("owner");
      ownerId = u.id;
    }
    const webRoot =
      body.webRoot && body.webRoot.trim().length > 0
        ? body.webRoot.trim()
        : renderWebRoot(srv.setup?.webRootTemplate ?? DEFAULT_WEB_ROOT_TEMPLATE, body.name);
    const created = await prisma.domain.create({
      data: {
        serverId: body.serverId,
        name: body.name,
        webRoot,
        cloakType: body.cloakType,
        ownerId,
      },
    });
    await logEvent({
      userId: me.id,
      action: "domain.create",
      target: created.id,
      meta: { name: body.name },
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
