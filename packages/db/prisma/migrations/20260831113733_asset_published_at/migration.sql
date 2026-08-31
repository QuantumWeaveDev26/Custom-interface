-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Asset_publishedAt_idx" ON "Asset"("publishedAt");
