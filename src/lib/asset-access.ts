import { prisma } from "./prisma";
import { canMutate, HttpError, type SessionUser, visibilityWhere } from "./rbac";

export type AssetKind = "landing" | "offer";

export interface AssetRow {
  id: string;
  name: string;
  originalFilename: string;
  filePath: string;
  sizeBytes: number;
  geoId: string;
  groupId: string | null;
  uploadedById: string;
}

export async function loadAssetForRead(
  user: SessionUser,
  kind: AssetKind,
  id: string,
): Promise<AssetRow> {
  const where = { id, ...visibilityWhere(user, kind) } as any;
  const asset =
    kind === "landing"
      ? await prisma.landing.findFirst({ where })
      : await prisma.offer.findFirst({ where });
  if (!asset) throw new HttpError(404, "not-found");
  return asset as AssetRow;
}

export async function loadAssetForWrite(
  user: SessionUser,
  kind: AssetKind,
  id: string,
): Promise<AssetRow> {
  const a = await loadAssetForRead(user, kind, id);
  if (!canMutate(user, { ownerId: a.uploadedById, groupId: a.groupId })) {
    throw new HttpError(403, "forbidden");
  }
  return a;
}
