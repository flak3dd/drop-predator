-- AlterTable
ALTER TABLE "Setting" ADD COLUMN "engineConfig" TEXT DEFAULT '{}';

-- CreateTable
CREATE TABLE "EngineRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "phase" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EngineProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engineRunId" TEXT,
    "shop" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "margin" INTEGER NOT NULL DEFAULT 0,
    "price" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "landedCost" REAL NOT NULL DEFAULT 0,
    "velocity" INTEGER NOT NULL DEFAULT 0,
    "trend" INTEGER NOT NULL DEFAULT 0,
    "lifecycle" TEXT NOT NULL DEFAULT 'mature',
    "competition" TEXT NOT NULL DEFAULT 'medium',
    "supplier" TEXT NOT NULL,
    "supplierScore" INTEGER NOT NULL DEFAULT 0,
    "moq" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "searches" INTEGER NOT NULL DEFAULT 0,
    "impulse" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "negState" INTEGER NOT NULL DEFAULT 0,
    "activePrice" TEXT NOT NULL DEFAULT 'standard',
    "discountImproved" INTEGER NOT NULL DEFAULT 0,
    "moqImproved" INTEGER NOT NULL DEFAULT 0,
    "aiNegotiated" BOOLEAN NOT NULL DEFAULT false,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "shopifyProductId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EngineProduct_engineRunId_fkey" FOREIGN KEY ("engineRunId") REFERENCES "EngineRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engineProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "bulletPoints" TEXT NOT NULL DEFAULT '[]',
    "seoTags" TEXT NOT NULL DEFAULT '[]',
    "metaDescription" TEXT NOT NULL,
    "collections" TEXT NOT NULL DEFAULT '[]',
    "pricingCopy" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductListing_engineProductId_fkey" FOREIGN KEY ("engineProductId") REFERENCES "EngineProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EngineRun_shop_status_idx" ON "EngineRun"("shop", "status");

-- CreateIndex
CREATE INDEX "EngineRun_shop_startedAt_idx" ON "EngineRun"("shop", "startedAt");

-- CreateIndex
CREATE INDEX "EngineProduct_shop_imported_idx" ON "EngineProduct"("shop", "imported");

-- CreateIndex
CREATE INDEX "EngineProduct_engineRunId_idx" ON "EngineProduct"("engineRunId");

-- CreateIndex
CREATE INDEX "EngineProduct_sourceId_idx" ON "EngineProduct"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_engineProductId_key" ON "ProductListing"("engineProductId");
