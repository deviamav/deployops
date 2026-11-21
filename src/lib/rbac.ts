import type { Role } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";

export interface AssetPermissions {
  canEditAssets: boolean;
  canDeleteAssets: boolean;
  canDownloadAssets: boolean;
  canViewAssetCode: boolean;
}

export interface SessionUser extends AssetPermissions {
  id: string;
  email: string;
  role: Role;
  groupId: string | null;
  name: string | null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Завжди завантажує свіжі дані користувача з БД, щоб не залежати від «застарілої» JWT.
 * Це гарантує, що щойно адмін зняв/додав permission — це одразу подіє на запити.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  const sessId = (session?.user as any)?.id as string | undefined;
  if (!sessId) throw new HttpError(401, "unauthorized");
  const u = await prisma.user.findUnique({ where: { id: sessId } });
  if (!u) throw new HttpError(401, "unauthorized");
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    groupId: u.groupId,
    canEditAssets: u.canEditAssets,
    canDeleteAssets: u.canDeleteAssets,
    canDownloadAssets: u.canDownloadAssets,
    canViewAssetCode: u.canViewAssetCode,
  };
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new HttpError(403, "forbidden");
  return user;
}

type Entity = "landing" | "offer" | "domain" | "server" | "job" | "audit";

/**
 * Повертає Prisma `where` для фільтрації за правами видимості (розділ 3.1 ТЗ).
 *
 * Модель:
 * - admin → бачить усе.
 * - team_lead → лідерує одній чи кільком групам (`Group.teamLeadId === me.id`).
 *   Бачить свої власні сутності + сутності членів його груп.
 * - operator → бачить тільки свої власні сутності (і public landing/offer без групи).
 */
export function visibilityWhere(user: SessionUser, entity: Entity): any {
  if (user.role === "admin") return {};

  if (entity === "landing" || entity === "offer") {
    if (user.role === "team_lead") {
      return {
        OR: [
          { groupId: null },
          { uploadedById: user.id },
          { group: { teamLeadId: user.id } },
        ],
      };
    }
    return {
      OR: [
        { groupId: null },
        { uploadedById: user.id },
        ...(user.groupId ? [{ groupId: user.groupId }] : []),
      ],
    };
  }
  if (entity === "domain" || entity === "server") {
    if (user.role === "team_lead") {
      return {
        OR: [
          { ownerId: user.id },
          { owner: { group: { teamLeadId: user.id } } },
        ],
      };
    }
    return { ownerId: user.id };
  }
  if (entity === "job") {
    if (user.role === "team_lead") {
      return {
        OR: [
          { startedById: user.id },
          { startedBy: { group: { teamLeadId: user.id } } },
        ],
      };
    }
    return { startedById: user.id };
  }
  if (entity === "audit") {
    if (user.role === "team_lead") {
      return {
        OR: [
          { userId: user.id },
          { user: { group: { teamLeadId: user.id } } },
        ],
      };
    }
    return { userId: user.id };
  }
  return {};
}

/**
 * Можливість RW конкретної сутності (за owner/group) для шляхів
 * на кшталт PATCH/DELETE.
 */
export function canMutate(
  user: SessionUser,
  ctx: { ownerId?: string | null; groupId?: string | null },
): boolean {
  if (user.role === "admin") return true;
  if (user.role === "team_lead") {
    if (ctx.ownerId === user.id) return true;
    if (ctx.groupId && ctx.groupId === user.groupId) return true;
    return false;
  }
  return ctx.ownerId === user.id;
}

/** Effective asset permissions: admin завжди true; інакше — згідно з полями User. */
export function canEditAsset(u: SessionUser): boolean {
  return u.role === "admin" || u.canEditAssets;
}
export function canDeleteAsset(u: SessionUser): boolean {
  return u.role === "admin" || u.canDeleteAssets;
}
export function canDownloadAsset(u: SessionUser): boolean {
  return u.role === "admin" || u.canDownloadAssets;
}
/**
 * Перегляд КОДУ файлів усередині ZIP (вкладка Files / editor).
 * Якщо дозволено редагувати — перегляд автоматично теж дозволено.
 */
export function canViewAssetCode(u: SessionUser): boolean {
  return u.role === "admin" || u.canViewAssetCode || u.canEditAssets;
}
