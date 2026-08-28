-- CreateTable
CREATE TABLE "JobInputAsset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobInputAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobInputAsset_assetId_idx" ON "JobInputAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "JobInputAsset_jobId_assetId_role_key" ON "JobInputAsset"("jobId", "assetId", "role");

-- AddForeignKey
ALTER TABLE "JobInputAsset" ADD CONSTRAINT "JobInputAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInputAsset" ADD CONSTRAINT "JobInputAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
