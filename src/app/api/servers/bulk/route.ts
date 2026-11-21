import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { encryptSecret } from "@/lib/crypto";
import { parseServersTxt } from "@/lib/parsers/servers-txt";
import { getClientIp, logEvent } from "@/lib/audit";
import { DEFAULT_WEB_ROOT_TEMPLATE, renderWebRoot } from "@/lib/server-setup";
import { checkHostForbidden, resolveAndCheckHost } from "@/lib/ssh";

const Schema = z.object({
  text: z.string().min(1),
  setupId: z.string().nullable().optional(),
  ownerId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const { text, setupId, ownerId } = Schema.parse(await req.json());
    const rows = parseServersTxt(text);

    const setup = setupId
      ? await prisma.serverSetup.findUnique({ where: { id: setupId } })
      : null;
    const webRootTemplate = setup?.webRootTemplate ?? DEFAULT_WEB_ROOT_TEMPLATE;

    let effectiveOwnerId = me.id;
    if (ownerId) {
      const u = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!u) throw new Error("owner not found");
      effectiveOwnerId = u.id;
    }

    // SECURITY (SSRF): фільтруємо приватні/loopback хости — інакше bulk-import
    // дозволяє admin-у завести `Server{host: 127.0.0.1}` і дотягтися до сусідніх
    // сервісів на panel-VPS через SSH-port-forwarding. Також робимо DNS-resolve,
    // щоб закрити rebinding (evil.com A→127.0.0.1).
    for (const r of rows) {
      if (r.error) continue;
      const err = checkHostForbidden(r.host);
      if (err) {
        r.error = err;
        continue;
      }
      try {
        await resolveAndCheckHost(r.host);
      } catch (err: any) {
        r.error = err?.message ?? "host validation failed";
      }
    }
    const valid = rows.filter((r) => !r.error);
    const errors = rows
      .filter((r) => r.error)
      .map((r) => ({ lineNo: r.lineNo, raw: r.raw, error: r.error! }));

    let createdServers = 0;
    let createdDomains = 0;
    const skipped: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const r of valid) {
        const existing = await tx.server.findFirst({
          where: { host: r.host, ownerId: effectiveOwnerId },
        });
        let serverId: string;
        if (existing) {
          serverId = existing.id;
          skipped.push(`server ${r.host} already exists`);
        } else {
          const s = await tx.server.create({
            data: {
              name: `vps-${r.host}`,
              host: r.host,
              port: 22,
              username: "root",
              passwordEncrypted: encryptSecret(r.password),
              ownerId: effectiveOwnerId,
              setupId: setup?.id ?? null,
            },
          });
          serverId = s.id;
          createdServers++;
        }
        for (const d of r.domains) {
          const dom = await tx.domain.findUnique({ where: { name: d } });
          if (dom) {
            skipped.push(`domain ${d} already exists`);
            continue;
          }
          await tx.domain.create({
            data: {
              name: d,
              serverId,
              ownerId: effectiveOwnerId,
              webRoot: renderWebRoot(webRootTemplate, d),
              deployMode: "pack_only",
            },
          });
          createdDomains++;
        }
      }
    });

    await logEvent({
      userId: me.id,
      action: "server.bulk_import",
      meta: { createdServers, createdDomains, errors: errors.length },
      ip: getClientIp(req),
    });

    return ok({
      created: createdServers,
      createdDomains,
      skipped,
      errors,
      parsed: rows.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
