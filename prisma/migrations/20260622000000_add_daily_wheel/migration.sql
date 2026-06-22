CREATE TABLE "DailyWheelReward" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "chance" DOUBLE PRECISION NOT NULL,
    "rewardType" TEXT NOT NULL,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyWheelSpin" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" INTEGER,
    "rewardName" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "amount" INTEGER,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "fulfilledBy" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelSpin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyWheelCooldown" (
    "userId" TEXT NOT NULL,
    "nextSpinAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWheelCooldown_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "DailyWheelSpin_userId_createdAt_idx" ON "DailyWheelSpin"("userId", "createdAt");
CREATE INDEX "DailyWheelSpin_createdAt_idx" ON "DailyWheelSpin"("createdAt");
