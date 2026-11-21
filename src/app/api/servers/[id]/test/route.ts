import { prisma } from "@/lib/prisma";
import { canMutate, HttpError, requireSession } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { testSsh } from "@/lib/ssh";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    const { id } = await ctx.params;
    const srv = await prisma.server.findUnique({ where: { id }, include: { owner: true } });
    if (!srv) return notFound();
    if (!canMutate(me, { ownerId: srv.ownerId, groupId: srv.owner.groupId }))
      throw new HttpError(403, "forbidden");
    const result = await testSsh(srv);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
