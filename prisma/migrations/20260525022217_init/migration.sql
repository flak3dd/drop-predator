-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropProduct" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT NOT NULL DEFAULT '',
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "dropPrice" TEXT NOT NULL DEFAULT '',
    "originalPrice" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "autoActivate" BOOLEAN NOT NULL DEFAULT false,
    "autoRevertPrice" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engineConfig" TEXT DEFAULT '{}',

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineRun" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "phase" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineProduct" (
    "id" TEXT NOT NULL,
    "engineRunId" TEXT,
    "shop" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "margin" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "landedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductListing" (
    "id" TEXT NOT NULL,
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
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drop_shop_status_idx" ON "Drop"("shop", "status");

-- CreateIndex
CREATE INDEX "Drop_shop_scheduledAt_idx" ON "Drop"("shop", "scheduledAt");

-- CreateIndex
CREATE INDEX "Drop_shop_createdAt_idx" ON "Drop"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Drop_status_scheduledAt_idx" ON "Drop"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "DropProduct_dropId_idx" ON "DropProduct"("dropId");

-- CreateIndex
CREATE INDEX "DropProduct_productId_idx" ON "DropProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DropProduct_dropId_productId_key" ON "DropProduct"("dropId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_shop_key" ON "Setting"("shop");

-- CreateIndex
CREATE INDEX "EngineRun_shop_status_idx" ON "EngineRun"("shop", "status");

-- CreateIndex
CREATE INDEX "EngineRun_shop_startedAt_idx" ON "EngineRun"("shop", "startedAt");

-- CreateIndex
CREATE INDEX "EngineProduct_shop_imported_idx" ON "EngineProduct"("shop", "imported");

-- CreateIndex
CREATE INDEX "EngineProduct_shop_score_idx" ON "EngineProduct"("shop", "score");

-- CreateIndex
CREATE INDEX "EngineProduct_shop_lifecycle_idx" ON "EngineProduct"("shop", "lifecycle");

-- CreateIndex
CREATE INDEX "EngineProduct_engineRunId_idx" ON "EngineProduct"("engineRunId");

-- CreateIndex
CREATE INDEX "EngineProduct_sourceId_idx" ON "EngineProduct"("sourceId");

-- CreateIndex
CREATE INDEX "EngineProduct_imported_createdAt_idx" ON "EngineProduct"("imported", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_engineProductId_key" ON "ProductListing"("engineProductId");

-- AddForeignKey
ALTER TABLE "DropProduct" ADD CONSTRAINT "DropProduct_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineProduct" ADD CONSTRAINT "EngineProduct_engineRunId_fkey" FOREIGN KEY ("engineRunId") REFERENCES "EngineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_engineProductId_fkey" FOREIGN KEY ("engineProductId") REFERENCES "EngineProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
