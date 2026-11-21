import { prisma } from "./prisma";

export interface AuditPayload {
  userId?: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function logEvent(payload: AuditPayload): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        userId: payload.userId ?? null,
        action: payload.action,
        target: payload.target ?? null,
        meta: (payload.meta as any) ?? undefined,
        ip: payload.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write:", e);
  }
}

export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}
