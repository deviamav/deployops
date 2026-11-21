import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { getClientIp, logEvent } from "@/lib/audit";

const PatchSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().nullable().optional(),
  role: z.enum(["admin", "team_lead", "operator"]).optional(),
  groupId: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
  canEditAssets: z.boolean().optional(),
  canDeleteAssets: z.boolean().optional(),
  canDownloadAssets: z.boolean().optional(),
  canViewAssetCode: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return notFound("user");

    // SECURITY (last-admin lockout): не дозволяємо демоутити останнього admin'а
    // або демоутити себе самого. Інакше admin випадково/злонавмисно блокує панель.
    if (body.role && body.role !== "admin" && target.role === "admin") {
      if (id === me.id) {
        return badRequest("cannot demote yourself");
      }
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return badRequest("cannot demote the last admin");
      }
    }

    const data: any = {};
    if (body.email !== undefined) data.email = body.email.trim().toLowerCase();
    if (body.name !== undefined) data.name = body.name?.trim() || null;
    if (body.role !== undefined) data.role = body.role;
    if (body.groupId !== undefined) data.groupId = body.groupId || null;
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    if (body.canEditAssets !== undefined) data.canEditAssets = body.canEditAssets;
    if (body.canDeleteAssets !== undefined) data.canDeleteAssets = body.canDeleteAssets;
    if (body.canDownloadAssets !== undefined) data.canDownloadAssets = body.canDownloadAssets;
    if (body.canViewAssetCode !== undefined) data.canViewAssetCode = body.canViewAssetCode;
    await prisma.user.update({ where: { id }, data });
    await logEvent({ userId: me.id, action: "user.update", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;

    // SECURITY (lockout): не можна видалити себе або останнього admin'а.
    if (id === me.id) return badRequest("cannot delete yourself");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return notFound("user");
    if (target.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) return badRequest("cannot delete the last admin");
    }

    await prisma.user.delete({ where: { id } });
    await logEvent({ userId: me.id, action: "user.delete", target: id, ip: getClientIp(req) });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
