-- AlterTable
ALTER TABLE "EngineProduct" ADD COLUMN     "brandKeywords" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "seoTitle" TEXT;

-- AlterTable
ALTER TABLE "EngineRun" ADD COLUMN     "brandResearch" TEXT NOT NULL DEFAULT '{}';
