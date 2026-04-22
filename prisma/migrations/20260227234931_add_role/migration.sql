/*
  Warnings:

  - Added the required column `color` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Role` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "color" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;
