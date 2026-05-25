-- AlterTable
ALTER TABLE "Drop" ADD COLUMN     "scheduledEndAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Drop_status_scheduledEndAt_idx" ON "Drop"("status", "scheduledEndAt");
