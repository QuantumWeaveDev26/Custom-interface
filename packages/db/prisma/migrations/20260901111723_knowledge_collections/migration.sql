-- AlterTable
ALTER TABLE "KnowledgeChunk" ADD COLUMN     "collection" TEXT NOT NULL DEFAULT 'filmmaking';

-- AlterTable
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "collection" TEXT NOT NULL DEFAULT 'filmmaking';
