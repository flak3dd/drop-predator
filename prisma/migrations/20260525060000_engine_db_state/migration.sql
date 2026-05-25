-- AlterTable: add runtime state fields to EngineRun
ALTER TABLE "EngineRun" ADD COLUMN IF NOT EXISTS "phaseSub" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EngineRun" ADD COLUMN IF NOT EXISTS "logs" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EngineRun" ADD COLUMN IF NOT EXISTS "dealsClosed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EngineRun" ADD COLUMN IF NOT EXISTS "sessionRev" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: compound unique on EngineProduct(engineRunId, sourceId)
-- Only add if not already present (safe for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'EngineProduct_engineRunId_sourceId_key'
  ) THEN
    ALTER TABLE "EngineProduct" ADD CONSTRAINT "EngineProduct_engineRunId_sourceId_key" UNIQUE ("engineRunId", "sourceId");
  END IF;
END $$;
