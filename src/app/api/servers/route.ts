import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, visibilityWhere } from "@/lib/rbac";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { encryptSecret } from "@/lib/crypto";
import { getClientIp, logEvent } from "@/lib/audit";
import { checkHostForbidden, resolveAndCheckHost } from "@/lib/ssh";

export async function GET() {
  try {
    const me = await requireSession();
    const where = visibilityWhere(me, "server");
    const servers = await prisma.server.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { domains: true } },
        setup: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    return ok(
      servers.map((s) => ({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        notes: s.notes,
        ownerId: s.ownerId,
        owner: s.owner,
        createdAt: s.createdAt,
        domainsCount: s._count.domains,
        setupId: s.setupId,
        setup: s.setup
          ? {
              id: s.setup.id,
              key: s.setup.key,
              name: s.setup.name,
              webRootTemplate: s.setup.webRootTemplate,
              webUser: s.setup.webUser,
            }
          : null,
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(64).default("root"),
  password: z.string().min(1).max(1024),
  notes: z.string().max(2000).nullable().optional(),
  setupId: z.string().nullable().optional(),
  ownerId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    // SECURITY (SSRF): забороняємо приватні діапазони та localhost для віддалених серверів.
    // Резолвимо хост у IP і перевіряємо обидва (string-форму та resolved address),
    // щоб закрити DNS-rebinding ("evil.com" A→127.0.0.1).
    const hostErr = checkHostForbidden(body.host);
    if (hostErr) return badRequest(hostErr);
    try {
      await resolveAndCheckHost(body.host);
    } catch (err: any) {
      return badRequest(err?.message ?? "host validation failed");
    }
    let ownerId = body.ownerId ?? me.id;
    if (body.ownerId) {
      const exists = await prisma.user.findUnique({ where: { id: body.ownerId } });
      if (!exists) return notFound("owner");
      ownerId = exists.id;
    }
    const created = await prisma.server.create({
      data: {
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        passwordEncrypted: encryptSecret(body.password),
        notes: body.notes ?? null,
        ownerId,
        setupId: body.setupId || null,
      },
    });
    await logEvent({
      userId: me.id,
      action: "server.create",
      target: created.id,
      meta: { host: body.host },
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
