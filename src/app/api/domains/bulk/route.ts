import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { parseDomainsTxt } from "@/lib/parsers/domains-txt";
import { getClientIp, logEvent } from "@/lib/audit";
import { DEFAULT_WEB_ROOT_TEMPLATE, renderWebRoot } from "@/lib/server-setup";

const Schema = z.object({
  text: z.string().min(1),
  defaultServerId: z.string().min(1),
  defaultCloakType: z.enum(["offer_only", "land_offer"]),
  ownerId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    const srv = await prisma.server.findUnique({
      where: { id: body.defaultServerId },
      include: { setup: true },
    });
    if (!srv) throw new HttpError(404, "server not found");

    let ownerId = me.id;
    if (body.ownerId) {
      const u = await prisma.user.findUnique({ where: { id: body.ownerId } });
      if (!u) throw new HttpError(404, "owner not found");
      ownerId = u.id;
    }

    const webRootTemplate = srv.setup?.webRootTemplate ?? DEFAULT_WEB_ROOT_TEMPLATE;

    const rows = parseDomainsTxt(body.text);
    const valid = rows.filter((r) => !r.error);
    const errors = rows
      .filter((r) => r.error)
      .map((r) => ({ lineNo: r.lineNo, raw: r.raw, error: r.error! }));

    let created = 0;
    const skipped: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const r of valid) {
        const exists = await tx.domain.findUnique({ where: { name: r.name } });
        if (exists) {
          skipped.push(`domain ${r.name} already exists`);
          continue;
        }
        await tx.domain.create({
          data: {
            name: r.name,
            serverId: body.defaultServerId,
            ownerId,
            webRoot: renderWebRoot(webRootTemplate, r.name),
            cloakType: body.defaultCloakType,
          },
        });
        created++;
      }
    });

    await logEvent({
      userId: me.id,
      action: "domain.bulk_import",
      meta: { created, errors: errors.length },
      ip: getClientIp(req),
    });

    return ok({ created, skipped, errors, parsed: rows.length });
  } catch (e) {
    return handleError(e);
  }
}
