/*
  Warnings:

  - You are about to drop the column `isMute` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Hive" DROP CONSTRAINT "Hive_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isMute",
ADD COLUMN     "xp" BIGINT NOT NULL DEFAULT 0;
