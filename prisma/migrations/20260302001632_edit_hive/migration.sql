-- AlterTable
ALTER TABLE "Hive" ADD COLUMN     "isUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logUrl" TEXT;
