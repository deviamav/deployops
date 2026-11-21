import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { logEvent, getClientIp } from "@/lib/audit";

export async function GET() {
  try {
    // Доступ: admin бачить ВСЕ, інші — лише обмежений список (для UserSelect/owner).
    const me = await requireSession();
    if (me.role === "admin") {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: { group: true },
      });
      return ok(
        users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          group: u.group ? { id: u.group.id, name: u.group.name } : null,
          createdAt: u.createdAt,
          canEditAssets: u.canEditAssets,
          canDeleteAssets: u.canDeleteAssets,
          canDownloadAssets: u.canDownloadAssets,
          canViewAssetCode: u.canViewAssetCode,
        })),
      );
    }
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true, role: true },
    });
    return ok(users);
  } catch (e) {
    return handleError(e);
  }
}

const PermsSchema = z.object({
  canEditAssets: z.boolean().optional(),
  canDeleteAssets: z.boolean().optional(),
  canDownloadAssets: z.boolean().optional(),
  canViewAssetCode: z.boolean().optional(),
});

const CreateSchema = z
  .object({
    email: z.string().email(),
    name: z.string().optional().nullable(),
    password: z.string().min(8),
    role: z.enum(["admin", "team_lead", "buyer"]),
    groupId: z.string().optional().nullable(),
  })
  .merge(PermsSchema);

export async function POST(req: Request) {
  try {
    const me = await requireRole("admin");
    const body = CreateSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const created = await prisma.user.create({
      data: {
        email,
        name: body.name?.trim() || null,
        passwordHash,
        role: body.role,
        groupId: body.groupId || null,
        canEditAssets: body.canEditAssets ?? false,
        canDeleteAssets: body.canDeleteAssets ?? false,
        canDownloadAssets: body.canDownloadAssets ?? false,
        canViewAssetCode: body.canViewAssetCode ?? false,
      },
    });
    await logEvent({
      userId: me.id,
      action: "user.create",
      target: created.id,
      ip: getClientIp(req),
    });
    return ok({ id: created.id });
  } catch (e) {
    return handleError(e);
  }
}
