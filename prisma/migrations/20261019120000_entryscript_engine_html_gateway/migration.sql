-- CreateEnum
CREATE TYPE "EntryEngine" AS ENUM ('php_gateway', 'html_gateway');

-- AlterTable
ALTER TABLE "EntryScript" ADD COLUMN "engine" "EntryEngine" NOT NULL DEFAULT 'php_gateway';
