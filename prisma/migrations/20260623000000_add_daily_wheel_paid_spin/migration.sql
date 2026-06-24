ALTER TABLE "DailyWheelSpin"
ADD COLUMN "spinMode" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN "spinPrice" INTEGER;

CREATE TABLE "DailyWheelSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paidSpinPrice" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "DailyWheelSettings_pkey" PRIMARY KEY ("id")
);
