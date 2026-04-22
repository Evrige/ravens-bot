-- DropIndex
DROP INDEX "Case_caseNumber_key";

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "callTakenAt" TIMESTAMP(3),
ADD COLUMN     "callTakenById" TEXT,
ADD COLUMN     "sourceMessageUrl" TEXT,
ALTER COLUMN "isAccepted" DROP NOT NULL,
ALTER COLUMN "isAccepted" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Hive" ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_callTakenById_fkey" FOREIGN KEY ("callTakenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
