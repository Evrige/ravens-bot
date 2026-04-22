-- CreateTable
CREATE TABLE "WeeklyFeeSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "price" INTEGER NOT NULL,

    CONSTRAINT "WeeklyFeeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyFeePayment" (
    "userId" TEXT NOT NULL,
    "paidFrom" TIMESTAMP(3) NOT NULL,
    "totalPaid" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyFeePayment_pkey" PRIMARY KEY ("userId")
);
