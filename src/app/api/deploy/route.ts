import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canMutate, HttpError, requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, badRequest, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { runDeployJob } from "@/server/deploy/runner";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  domainId: z.string().min(1),
  geoId: z.string().min(1),
  cloakerScriptId: z.string().min(1),
  /** Не потрібен для palladium_redirect */
  offerId: z.string().min(1).optional().nullable(),
  landingId: z.string().optional().nullable(),
  landingName: z.string().optional().nullable(),
  /** Override типу cloak: якщо null — використовується domain.cloakType. */
  cloakType: z.enum(["offer_only", "land_offer"]).optional().nullable(),
  /** Платформа пікселя: google (дефолт) | facebook | tiktok */
  pixelPlatform: z.enum(["google", "facebook", "tiktok"]).optional().default("google"),
});

export async function POST(req: Request) {
  try {
    const me = await requireSession();

    const rl = rateLimit(`deploy:${me.id}`);
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
    if (!domain) return badRequest("domain not accessible");
    if (!canMutate(me, { ownerId: domain.ownerId, groupId: domain.owner.groupId }))
      throw new HttpError(403, "forbidden");

    const cloaker = await prisma.cloakerScript.findUnique({
      where: { id: body.cloakerScriptId },
    });
    if (!cloaker) return badRequest("cloaker not found");
    if (cloaker.geoId !== body.geoId) {
      return badRequest("cloaker geo does not match selected geo");
    }

    const isRedirect = cloaker.engine === "palladium_redirect";
    const effectiveType = isRedirect
      ? "offer_only"
      : (body.cloakType ?? domain.cloakType);

    if (!isRedirect && effectiveType === "land_offer" && !body.landingId) {
      return badRequest("landing required for land_offer");
    }

    // SECURITY (IDOR): offerId/landingId — через visibility (для redirect офер не потрібен).
    if (!isRedirect) {
      if (!body.offerId) return badRequest("offer required");
      const offer = await prisma.offer.findFirst({
        where: { id: body.offerId, ...visibilityWhere(me, "offer") },
      });
      if (!offer) return badRequest("offer not accessible");
      if (effectiveType === "land_offer" && body.landingId) {
        const landing = await prisma.landing.findFirst({
          where: { id: body.landingId, ...visibilityWhere(me, "landing") },
        });
        if (!landing) return badRequest("landing not accessible");
      }
    }

    const job = await prisma.cloakJob.create({
      data: {
        domainId: body.domainId,
        geoId: body.geoId,
        cloakerScriptId: body.cloakerScriptId,
        offerId: isRedirect ? null : body.offerId!,
        landingId:
          !isRedirect && effectiveType === "land_offer" ? body.landingId || null : null,
        landingName: isRedirect ? null : body.landingName || null,
        cloakType: isRedirect ? "offer_only" : (body.cloakType ?? null),
        pixelPlatform: isRedirect ? "google" : (body.pixelPlatform ?? "google"),
        startedById: me.id,
        status: "queued",
      },
    });

    await logEvent({
      userId: me.id,
      action: "deploy.start",
      target: job.id,
      meta: {
        domainId: body.domainId,
        cloakerScriptId: body.cloakerScriptId,
        geoId: body.geoId,
        engine: cloaker.engine,
        pixelPlatform: isRedirect ? "google" : (body.pixelPlatform ?? "google"),
      },
      ip: getClientIp(req),
    });

    runDeployJob({ jobId: job.id }).catch((e) => console.error("[deploy] background:", e));

    return ok({ jobId: job.id });
  } catch (e) {
    return handleError(e);
  }
}

export async function GET(req: Request) {
  try {
    const me = await requireSession();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
    const where = visibilityWhere(me, "job");
    const [items, total] = await Promise.all([
      prisma.cloakJob.findMany({
        where,
        orderBy: { startedAt: "desc" },
        include: {
          domain: { select: { id: true, name: true, cloakType: true } },
          geo: true,
          cloakerScript: { select: { id: true, name: true } },
          startedBy: { select: { id: true, email: true } },
        },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.cloakJob.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  } catch (e) {
    return handleError(e);
  }
}
