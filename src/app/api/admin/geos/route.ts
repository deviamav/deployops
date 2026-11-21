import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";
import { resolveStoredFlag } from "@/lib/geo-flag";

export async function GET() {
  try {
    await requireSession();
    const geos = await prisma.geo.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: { landings: true, offers: true, cloakers: true, jobs: true },
        },
      },
    });
    return ok(geos);
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  code: z
    .string()
    .regex(/^[A-Z]{2}$/i, "must be 2 letters")
    .transform((s) => s.toUpperCase()),
  name: z.string().min(1),
  flag: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = Schema.parse(await req.json());
    const storedFlag = resolveStoredFlag(body.flag, body.code);
    const created = await prisma.geo.create({
      data: {
        code: body.code,
        name: body.name,
        flag: storedFlag,
        active: body.active ?? true,
      },
    });
    await logEvent({ userId: me.id, action: "geo.create", target: created.id, ip: getClientIp(req) });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
