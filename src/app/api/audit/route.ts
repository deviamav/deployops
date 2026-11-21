import { prisma } from "@/lib/prisma";
import { requireRole, visibilityWhere } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "team_lead");
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)));
    const userId = url.searchParams.get("userId");
    const action = url.searchParams.get("action");
    const where: any = { ...visibilityWhere(me, "audit") };
    if (userId) where.userId = userId;
    if (action) where.action = action;

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    const userIds = Array.from(new Set(items.map((i) => i.userId).filter(Boolean) as string[]));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return ok({
      items: items.map((i) => ({ ...i, user: i.userId ? userMap[i.userId] : null })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return handleError(e);
  }
}
