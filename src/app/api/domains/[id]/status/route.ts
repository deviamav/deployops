import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

/**
 * Окремий endpoint для мануальної зміни статусу домена — для випадків,
 * коли клоак робився руками поза панеллю, або треба позначити "вже зроблено".
 *
 * Дозволено:
 *   - admin: будь-який домен
 *   - team_lead: тільки видимі через visibilityWhere (свої + своєї команди)
 *   - buyer: тільки свої домени
 *
 * НЕ зачіпає інші поля — не дає team_lead'у змінити server/webRoot/ownerId.
 */
const Schema = z.object({
  status: z.enum(["pending", "deployed", "failed"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());

    // visibilityWhere повертає WHERE-умову для domains, до яких user має доступ
    const where =
      me.role === "admin"
        ? { id }
        : { AND: [{ id }, visibilityWhere(me, "domain")] };

    const cur = await prisma.domain.findFirst({ where });
    if (!cur) return notFound();

    await prisma.domain.update({
      where: { id: cur.id },
      data: {
        status: body.status,
        // якщо позначаємо як cloaked вручну і lastCloakAt ще не виставлений — ставимо now()
        ...(body.status === "deployed" && !cur.lastCloakAt
          ? { lastCloakAt: new Date() }
          : {}),
      },
    });

    await logEvent({
      userId: me.id,
      action: "domain.status.manual",
      target: id,
      meta: { from: cur.status, to: body.status },
      ip: getClientIp(req),
    });

    return ok({ ok: true, status: body.status });
  } catch (e) {
    return handleError(e);
  }
}
