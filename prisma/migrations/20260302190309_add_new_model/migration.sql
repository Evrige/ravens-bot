-- CreateTable
CREATE TABLE "Case" (
    "id" BIGSERIAL NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "orgId" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channelId" TEXT,
    "messageId" TEXT,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHive" (
    "id" BIGSERIAL NOT NULL,
    "caseId" BIGINT NOT NULL,
    "hiveId" BIGINT NOT NULL,

    CONSTRAINT "CaseHive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNumber_key" ON "Case"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CaseHive_caseId_hiveId_key" ON "CaseHive"("caseId", "hiveId");

-- AddForeignKey
ALTER TABLE "CaseHive" ADD CONSTRAINT "CaseHive_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHive" ADD CONSTRAINT "CaseHive_hiveId_fkey" FOREIGN KEY ("hiveId") REFERENCES "Hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
