import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    include: { group: true },
  });
  if (!user) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const isAdmin = user.role === "admin";
  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // Effective permissions: admin завжди має все.
        canEditAssets: isAdmin || user.canEditAssets,
        canDeleteAssets: isAdmin || user.canDeleteAssets,
        canDownloadAssets: isAdmin || user.canDownloadAssets,
        canViewAssetCode: isAdmin || user.canViewAssetCode || user.canEditAssets,
      },
      group: user.group,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
