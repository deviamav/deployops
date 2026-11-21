import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, visibilityWhere } from "@/lib/rbac";
import { handleError, badRequest, ok, parseRequestFormData } from "@/lib/http";
import { PATHS, ensureUploadDirs } from "@/lib/paths";
import { inspectZip } from "@/lib/zip";
import { getClientIp, logEvent } from "@/lib/audit";

const MAX_BYTES = Number(process.env.UPLOAD_MAX_SIZE_MB ?? 512) * 1024 * 1024;

export async function GET(req: Request) {
  try {
    const me = await requireSession();
    const url = new URL(req.url);
    const geoId = url.searchParams.get("geoId") ?? undefined;
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const where: any = { ...visibilityWhere(me, "offer") };
    if (geoId) where.geoId = geoId;
    if (groupId) where.groupId = groupId === "null" ? null : groupId;
    const items = await prisma.offer.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      include: { geo: true, group: true, uploadedBy: { select: { email: true } } },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  name: z.string().min(1),
  geoId: z.string().min(1),
  groupId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin", "team_lead");
    await ensureUploadDirs();
    const form = await parseRequestFormData(req);
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("file required");
    if (file.size > MAX_BYTES) return badRequest("file too large");
    if (!file.name.toLowerCase().endsWith(".zip")) return badRequest("only .zip allowed");

    const meta = Schema.parse({
      name: form.get("name"),
      geoId: form.get("geoId"),
      groupId: form.get("groupId") || null,
    });

    const buf = Buffer.from(await file.arrayBuffer());
    const report = inspectZip(buf);
    if (!report.ok) return badRequest(`zip rejected: ${report.error}`);

    const id = randomUUID();
    const dest = path.join(PATHS.offers, `${id}.zip`);
    await fs.writeFile(dest, buf);

    const created = await prisma.offer.create({
      data: {
        name: meta.name,
        originalFilename: file.name,
        filePath: dest,
        sizeBytes: file.size,
        geoId: meta.geoId,
        groupId: meta.groupId || null,
        uploadedById: me.id,
      },
    });

    await logEvent({
      userId: me.id,
      action: "pack.upload",
      target: created.id,
      meta: { name: meta.name, size: file.size },
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
