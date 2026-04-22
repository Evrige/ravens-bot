-- CreateEnum
CREATE TYPE "ImprovementRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AfkRecordStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MarketOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');

-- CreateTable
CREATE TABLE "ImprovementRequest" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ImprovementRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "declineReason" TEXT,
    "messageId" TEXT,
    "channelId" TEXT,
    "messageUrl" TEXT,

    CONSTRAINT "ImprovementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfkRecord" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AfkRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" BIGSERIAL NOT NULL,
    "sellingId" BIGINT,
    "userId" TEXT NOT NULL,
    "marketId" BIGINT,
    "marketName" TEXT NOT NULL,
    "marketPrice" DECIMAL NOT NULL,
    "status" "MarketOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenById" TEXT,
    "takenAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "logMessageId" TEXT,
    "logChannelId" TEXT,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImprovementRequest_userId_createdAt_idx" ON "ImprovementRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImprovementRequest_status_createdAt_idx" ON "ImprovementRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AfkRecord_userId_createdAt_idx" ON "AfkRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AfkRecord_status_endAt_idx" ON "AfkRecord"("status", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_sellingId_key" ON "MarketOrder"("sellingId");

-- CreateIndex
CREATE INDEX "MarketOrder_userId_createdAt_idx" ON "MarketOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketOrder_status_createdAt_idx" ON "MarketOrder"("status", "createdAt");
