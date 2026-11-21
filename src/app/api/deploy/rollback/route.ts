import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canMutate, HttpError, requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { startRollbackJob } from "@/server/deploy/rollback-runner";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({ domainId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const me = await requireSession();

    const rl = rateLimit(`rollback:${me.id}`);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "rate-limit" }), {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      });
    }

    const body = Schema.parse(await req.json());
    const domain = await prisma.domain.findFirst({
      where: { id: body.domainId, ...visibilityWhere(me, "domain") },
      include: { owner: true },
    });
    if (!domain) throw new HttpError(404, "domain not accessible");
    if (!canMutate(me, { ownerId: domain.ownerId, groupId: domain.owner.groupId })) {
      throw new HttpError(403, "forbidden");
    }

    const jobId = await startRollbackJob({ domainId: domain.id, userId: me.id });
    await logEvent({
      userId: me.id,
      action: "domain.rollback.start",
      target: domain.id,
      meta: { jobId },
      ip: getClientIp(req),
    });
    return ok({ jobId });
  } catch (e) {
    return handleError(e);
  }
}
