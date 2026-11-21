import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AssetLibrary } from "@/components/asset-library";

export default async function ContentPacksPage() {
  const session = await auth();
  const me = await prisma.user.findUnique({
    where: { id: (session?.user as any)?.id ?? "__none__" },
  });
  const isAdmin = me?.role === "admin";
  const canUpload = me?.role === "admin" || me?.role === "team_lead";
  const canEdit = isAdmin || !!me?.canEditAssets;
  const canDelete = isAdmin || !!me?.canDeleteAssets;
  const canDownload = isAdmin || !!me?.canDownloadAssets;
  const canViewCode = isAdmin || !!me?.canViewAssetCode || !!me?.canEditAssets;

  return (
    <AssetLibrary
      kind="packs"
      title="Content Packs"
      description="Content pack library (ZIP)"
      canUpload={canUpload}
      canEdit={canEdit}
      canDelete={canDelete}
      canDownload={canDownload}
      canViewCode={canViewCode}
    />
  );
}
