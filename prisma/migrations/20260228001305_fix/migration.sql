/*
  Warnings:

  - You are about to alter the column `price` on the `Role` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `BigInt`.

*/
-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE BIGINT;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
