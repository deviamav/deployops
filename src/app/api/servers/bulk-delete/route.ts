import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    let okCount = 0;
    const errors: { id: string; error: string }[] = [];

    for (const id of body.ids) {
      try {
        const s = await prisma.server.findUnique({
          where: { id },
          include: { _count: { select: { domains: true } } },
        });
        if (!s) {
          errors.push({ id, error: "not found" });
          continue;
        }
        if (s._count.domains > 0) {
          errors.push({ id, error: "has domains" });
          continue;
        }
        await prisma.server.delete({ where: { id } });
        await logEvent({
          userId: me.id,
          action: "server.delete",
          target: id,
          ip: getClientIp(req),
        });
        okCount++;
      } catch (e: any) {
        errors.push({ id, error: e?.message ?? "failed" });
      }
    }

    return ok({ ok: okCount, errors });
  } catch (e) {
    return handleError(e);
  }
}
