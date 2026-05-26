-- CreateTable
CREATE TABLE "AliCredential" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiry" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiry" TIMESTAMP(3) NOT NULL,
    "aliUserId" TEXT NOT NULL DEFAULT '',
    "aliUserNick" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AliCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AliOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderNum" TEXT NOT NULL DEFAULT '',
    "aliOrderId" TEXT,
    "aliProductId" TEXT NOT NULL DEFAULT '',
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "skuAttr" TEXT NOT NULL DEFAULT '',
    "shippingService" TEXT NOT NULL DEFAULT 'CAINIAO_STANDARD',
    "productCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "buyerAddress" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "carrierCode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AliOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AliCredential_shop_key" ON "AliCredential"("shop");

-- CreateIndex
CREATE INDEX "AliCredential_shop_idx" ON "AliCredential"("shop");

-- CreateIndex
CREATE INDEX "AliOrder_shop_status_idx" ON "AliOrder"("shop", "status");

-- CreateIndex
CREATE INDEX "AliOrder_shopifyOrderId_idx" ON "AliOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "AliOrder_aliOrderId_idx" ON "AliOrder"("aliOrderId");

-- CreateIndex
CREATE INDEX "AliOrder_shop_createdAt_idx" ON "AliOrder"("shop", "createdAt");
