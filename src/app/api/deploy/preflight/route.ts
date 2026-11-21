import { prisma } from "@/lib/prisma";
import { requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, badRequest, ok } from "@/lib/http";

/**
 * Preflight: рекомендує geoId і список валідних cloaker-скриптів за обраним
 * geo. Сценарії - розділ 4.4 ТЗ.
 */
export async function GET(req: Request) {
  try {
    const me = await requireSession();
    const url = new URL(req.url);
    const domainId = url.searchParams.get("domainId");
    const offerId = url.searchParams.get("offerId");
    const landingId = url.searchParams.get("landingId");
    if (!domainId || !offerId) return badRequest("domainId and offerId required");

    const domain = await prisma.domain.findFirst({
      where: { id: domainId, ...visibilityWhere(me, "domain") },
    });
    if (!domain) return badRequest("domain not accessible");

    const offer = await prisma.offer.findFirst({
      where: { id: offerId, ...visibilityWhere(me, "offer") },
      include: { geo: true },
    });
    if (!offer) return badRequest("offer not accessible");

    let landing = null;
    if (landingId) {
      landing = await prisma.landing.findFirst({
        where: { id: landingId, ...visibilityWhere(me, "landing") },
        include: { geo: true },
      });
      if (!landing) return badRequest("landing not accessible");
    }

    const suggestedGeoId =
      landing && landing.geoId === offer.geoId ? landing.geoId : offer.geoId;
    const geoMismatch = !!landing && landing.geoId !== offer.geoId;

    const validCloakers = await prisma.cloakerScript.findMany({
      where: { geoId: suggestedGeoId },
      orderBy: [{ isDefault: "desc" }, { uploadedAt: "desc" }],
    });
    const defaultCloakerId = validCloakers.find((c) => c.isDefault)?.id ?? null;

    return ok({
      domain: { id: domain.id, name: domain.name, cloakType: domain.cloakType },
      suggestedGeoId,
      geoMismatch,
      validCloakers,
      defaultCloakerId,
    });
  } catch (e) {
    return handleError(e);
  }
}
