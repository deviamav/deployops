import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AssetEditor } from "@/components/asset-editor";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const me = await prisma.user.findUnique({
    where: { id: (session?.user as any)?.id ?? "__none__" },
  });
  const isAdmin = me?.role === "admin";
  const canEdit = isAdmin || !!me?.canEditAssets;
  const canDelete = isAdmin || !!me?.canDeleteAssets;
  const canDownload = isAdmin || !!me?.canDownloadAssets;
  const canViewCode = isAdmin || !!me?.canViewAssetCode || !!me?.canEditAssets;
  if (!canViewCode) redirect("/templates");
  return (
    <AssetEditor
      kind="templates"
      id={id}
      canEdit={canEdit}
      canDelete={canDelete}
      canDownload={canDownload}
    />
  );
}
