import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    // не видаляємо default-скрипти масово бездумно — просто deleteMany
    const result = await prisma.entryScript.deleteMany({
      where: { id: { in: body.ids } },
    });
    await logEvent({
      userId: me.id,
      action: "script.bulk_delete",
      meta: { count: result.count },
      ip: getClientIp(req),
    });
    return ok({ ok: result.count });
  } catch (e) {
    return handleError(e);
  }
}
