import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { handleError, ok } from "@/lib/http";
import { randomPassword } from "@/lib/utils";
import { getClientIp, logEvent } from "@/lib/audit";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    const { id } = await ctx.params;
    const password = randomPassword(16);
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await logEvent({
      userId: me.id,
      action: "user.reset_password",
      target: id,
      ip: getClientIp(req),
    });
    return ok({ password });
  } catch (e) {
    return handleError(e);
  }
}
