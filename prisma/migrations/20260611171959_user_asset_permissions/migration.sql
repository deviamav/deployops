-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canDeleteAssets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canDownloadAssets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canEditAssets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewAssetCode" BOOLEAN NOT NULL DEFAULT false;
