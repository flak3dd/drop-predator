-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DropProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dropId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT NOT NULL DEFAULT '',
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "dropPrice" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DropProduct_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Drop_shop_status_idx" ON "Drop"("shop", "status");

-- CreateIndex
CREATE INDEX "Drop_shop_scheduledAt_idx" ON "Drop"("shop", "scheduledAt");

-- CreateIndex
CREATE INDEX "DropProduct_dropId_idx" ON "DropProduct"("dropId");

-- CreateIndex
CREATE UNIQUE INDEX "DropProduct_dropId_productId_key" ON "DropProduct"("dropId", "productId");
