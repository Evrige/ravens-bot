ALTER TABLE "ImprovementRequest"
ADD COLUMN IF NOT EXISTS "applicantUsername" TEXT,
ADD COLUMN IF NOT EXISTS "applicantDisplayName" TEXT,
ADD COLUMN IF NOT EXISTS "applicantRegisteredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "applicantJoinedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "RankHistory" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rankKey" TEXT NOT NULL,
    "rankLabel" TEXT NOT NULL,
    "targetRoleId" TEXT,
    "targetRoleName" TEXT,
    "beforeRanks" TEXT,
    "afterRanks" TEXT,
    "reason" TEXT,
    "moderatorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "relatedImprovementRequestId" BIGINT,
    "applicantUsername" TEXT,
    "applicantDisplayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RankHistory_userId_createdAt_idx"
ON "RankHistory"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "RankHistory_moderatorId_createdAt_idx"
ON "RankHistory"("moderatorId", "createdAt");
