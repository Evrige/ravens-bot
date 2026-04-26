CREATE TABLE IF NOT EXISTS "MarketSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MarketSettings" ("id", "isOpen", "updatedAt")
VALUES (1, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
