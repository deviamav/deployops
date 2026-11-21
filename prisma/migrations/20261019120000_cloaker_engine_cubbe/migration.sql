-- CreateEnum
CREATE TYPE "CloakerEngine" AS ENUM ('palladium', 'cubbe');

-- AlterTable
ALTER TABLE "CloakerScript" ADD COLUMN "engine" "CloakerEngine" NOT NULL DEFAULT 'palladium';
