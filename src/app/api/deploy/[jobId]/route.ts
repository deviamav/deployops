import { prisma } from "@/lib/prisma";
import { requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const me = await requireSession();
    const { jobId } = await ctx.params;
    const job = await prisma.deployJob.findFirst({
      where: { id: jobId, ...visibilityWhere(me, "job") },
      include: {
        domain: true,
        geo: true,
        entryScript: { select: { id: true, name: true } },
        startedBy: { select: { id: true, email: true } },
      },
    });
    if (!job) return notFound();
    return ok(job);
  } catch (e) {
    return handleError(e);
  }
}
