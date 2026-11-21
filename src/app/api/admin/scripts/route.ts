import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { handleError, ok, badRequest, parseRequestFormData } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";
import { PATHS, ensureUploadDirs } from "@/lib/paths";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: Request) {
  try {
    const me = await requireSession();
    const url = new URL(req.url);
    const geoId = url.searchParams.get("geoId") ?? undefined;
    const items = await prisma.entryScript.findMany({
      where: geoId ? { geoId } : {},
      orderBy: [{ isDefault: "desc" }, { uploadedAt: "desc" }],
      include: { geo: true },
    });
    // Не-адмін бачить тільки метадані без filePath і нотаток.
    const isAdmin = me.role === "admin";
    return ok(
      items.map((c) => ({
        id: c.id,
        name: c.name,
        geoId: c.geoId,
        geo: c.geo,
        engine: c.engine,
        isDefault: c.isDefault,
        uploadedAt: c.uploadedAt,
        ...(isAdmin ? { filePath: c.filePath, notes: c.notes } : {}),
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}

const Schema = z.object({
  name: z.string().min(1),
  geoId: z.string().min(1),
  notes: z.string().optional().nullable(),
  engine: z
    .enum(["php_gateway", "php_redirect", "html_gateway"])
    .optional()
    .default("php_gateway"),
  isDefault: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v === "true" || v === "on" || v === "1" : v))
    .optional()
    .default(false),
});

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    await ensureUploadDirs();
    const form = await parseRequestFormData(req);
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("file required");
    if (!file.name.toLowerCase().endsWith(".php")) return badRequest("only .php allowed");
    if (file.size > MAX_BYTES) return badRequest("file too large (>2MB)");
    const meta = Schema.parse({
      name: form.get("name"),
      geoId: form.get("geoId"),
      notes: form.get("notes") ?? undefined,
      engine: form.get("engine") ?? "php_gateway",
      isDefault: form.get("isDefault") ?? false,
    });

    const id = randomUUID();
    const dest = path.join(PATHS.entryScripts, `${id}.php`);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);

    const created = await prisma.$transaction(async (tx) => {
      if (meta.isDefault) {
        await tx.entryScript.updateMany({
          where: { geoId: meta.geoId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.entryScript.create({
        data: {
          name: meta.name,
          geoId: meta.geoId,
          notes: meta.notes ?? null,
          engine: meta.engine ?? "php_gateway",
          isDefault: meta.isDefault ?? false,
          filePath: dest,
        },
      });
    });

    await logEvent({
      userId: me.id,
      action: "script.upload",
      target: created.id,
      meta: { name: meta.name, geoId: meta.geoId, engine: meta.engine },
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
