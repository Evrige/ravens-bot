CREATE TYPE "PromoRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'DECLINED');

CREATE TABLE "PromoRequest" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PromoRequestStatus" NOT NULL DEFAULT 'PENDING',
    "promoCode" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "requestMessageId" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromoRequest_userId_createdAt_idx" ON "PromoRequest"("userId", "createdAt");
CREATE INDEX "PromoRequest_status_createdAt_idx" ON "PromoRequest"("status", "createdAt");
