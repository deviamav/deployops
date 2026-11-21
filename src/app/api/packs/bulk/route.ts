import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  canDeleteAsset,
  canEditAsset,
  canMutate,
  HttpError,
  requireSession,
} from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["delete", "patch"]),
  patch: z
    .object({
      geoId: z.string().min(1).optional(),
      groupId: z.string().nullable().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireSession();
    const body = Schema.parse(await req.json());

    if (body.action === "delete" && !canDeleteAsset(me)) {
      throw new HttpError(403, "forbidden");
    }
    if (
      body.action === "patch" &&
      me.role !== "admin" &&
      me.role !== "team_lead" &&
      !canEditAsset(me)
    ) {
      throw new HttpError(403, "forbidden");
    }

    const items = await prisma.offer.findMany({ where: { id: { in: body.ids } } });
    let okCount = 0;
    const errors: { id: string; error: string }[] = [];

    for (const item of items) {
      if (!canMutate(me, { ownerId: item.uploadedById, groupId: item.groupId })) {
        errors.push({ id: item.id, error: "forbidden" });
        continue;
      }
      try {
        if (body.action === "delete") {
          await prisma.offer.delete({ where: { id: item.id } });
          await fs.unlink(item.filePath).catch(() => {});
          await logEvent({
            userId: me.id,
            action: "pack.delete",
            target: item.id,
            ip: getClientIp(req),
          });
        } else {
          const patch = body.patch ?? {};
          await prisma.offer.update({
            where: { id: item.id },
            data: {
              ...(patch.geoId !== undefined ? { geoId: patch.geoId } : {}),
              ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
            },
          });
          await logEvent({
            userId: me.id,
            action: "pack.bulk_update",
            target: item.id,
            meta: patch,
            ip: getClientIp(req),
          });
        }
        okCount++;
      } catch (e: unknown) {
        errors.push({ id: item.id, error: (e as Error)?.message ?? "failed" });
      }
    }

    const missing = body.ids.filter((id) => !items.find((i) => i.id === id));
    for (const id of missing) errors.push({ id, error: "not found" });

    return ok({ ok: okCount, errors });
  } catch (e) {
    return handleError(e);
  }
}
