import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["delete"]),
});

/** Bulk ops for domains (admin). */
export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());

    if (body.action === "delete") {
      const result = await prisma.domain.deleteMany({
        where: { id: { in: body.ids } },
      });
      await logEvent({
        userId: me.id,
        action: "domain.bulk_delete",
        meta: { count: result.count, ids: body.ids },
        ip: getClientIp(req),
      });
      return ok({ ok: result.count });
    }

    return ok({ ok: 0 });
  } catch (e) {
    return handleError(e);
  }
}
