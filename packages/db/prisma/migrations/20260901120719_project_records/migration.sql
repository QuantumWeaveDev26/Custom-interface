-- CreateTable
CREATE TABLE "ProjectRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "characterId" TEXT,
    "knowledgeDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectRecord_userId_kind_idx" ON "ProjectRecord"("userId", "kind");
