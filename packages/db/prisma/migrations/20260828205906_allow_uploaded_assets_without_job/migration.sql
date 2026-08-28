-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_jobId_fkey";

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "jobId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
