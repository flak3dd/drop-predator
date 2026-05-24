-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "autoActivate" BOOLEAN NOT NULL DEFAULT false,
    "autoRevertPrice" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DropProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dropId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT NOT NULL DEFAULT '',
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "dropPrice" TEXT NOT NULL DEFAULT '',
    "originalPrice" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DropProduct_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DropProduct" ("allocatedQuantity", "createdAt", "dropId", "dropPrice", "id", "productId", "productImage", "productTitle") SELECT "allocatedQuantity", "createdAt", "dropId", "dropPrice", "id", "productId", "productImage", "productTitle" FROM "DropProduct";
DROP TABLE "DropProduct";
ALTER TABLE "new_DropProduct" RENAME TO "DropProduct";
CREATE INDEX "DropProduct_dropId_idx" ON "DropProduct"("dropId");
CREATE INDEX "DropProduct_productId_idx" ON "DropProduct"("productId");
CREATE UNIQUE INDEX "DropProduct_dropId_productId_key" ON "DropProduct"("dropId", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Setting_shop_key" ON "Setting"("shop");
