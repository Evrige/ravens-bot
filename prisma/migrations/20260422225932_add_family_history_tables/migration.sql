/*
  Warnings:

  - You are about to alter the column `marketPrice` on the `MarketOrder` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "AfkRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ImprovementRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketOrder" ALTER COLUMN "marketPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "updatedAt" DROP DEFAULT;
