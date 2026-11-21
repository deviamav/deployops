-- CreateEnum
CREATE TYPE "PixelPlatform" AS ENUM ('google', 'facebook', 'tiktok');

-- AlterTable
ALTER TABLE "DeployJob" ADD COLUMN "pixelPlatform" "PixelPlatform" NOT NULL DEFAULT 'google';
