-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "setupId" TEXT;

-- CreateTable
CREATE TABLE "ServerSetup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webRootTemplate" TEXT NOT NULL,
    "webUser" TEXT,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSetup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerSetup_key_key" ON "ServerSetup"("key");

-- CreateIndex
CREATE INDEX "Server_setupId_idx" ON "Server"("setupId");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "ServerSetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
