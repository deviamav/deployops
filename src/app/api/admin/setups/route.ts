import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { badRequest, handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

export async function GET() {
  try {
    // Усі автентифіковані бачать список (потрібно для селектора при створенні сервера).
    await requireSession();
    const items = await prisma.serverSetup.findMany({
      orderBy: [{ isBuiltin: "desc" }, { name: "asc" }],
      include: { _count: { select: { servers: true } } },
    });
    return ok(
      items.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        webRootTemplate: s.webRootTemplate,
        webUser: s.webUser,
        isBuiltin: s.isBuiltin,
        createdAt: s.createdAt,
        serversCount: s._count.servers,
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "key: тільки a-z, 0-9, _, -"),
  name: z.string().min(1).max(120),
  // SECURITY: webRootTemplate підставляється в SSH-команди (chown/cp/unzip).
  // Заборонені shell-метасимволи, бектики, $(...) тощо.
  webRootTemplate: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^\/[a-zA-Z0-9._{}/-]+$/,
      "webRootTemplate: абсолютний шлях, дозволені [a-zA-Z0-9._{}/-]",
    )
    .refine((s) => !s.includes(".."), "webRootTemplate: '..' заборонено"),
  // SECURITY: webUser попадає в `chown user:user ...`. Тільки валідні Unix-імена.
  webUser: z
    .string()
    .regex(
      /^[a-z_][a-z0-9_-]{0,31}$/,
      "webUser: [a-z_][a-z0-9_-]{0,31} (POSIX user name)",
    )
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    if (!body.webRootTemplate.includes("{domain}")) {
      return badRequest("webRootTemplate must contain {domain}");
    }
    const created = await prisma.serverSetup.create({
      data: {
        key: body.key,
        name: body.name,
        webRootTemplate: body.webRootTemplate,
        webUser: body.webUser?.trim() || null,
        isBuiltin: false,
      },
    });
    await logEvent({
      userId: me.id,
      action: "setup.create",
      target: created.id,
      meta: { key: created.key },
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
