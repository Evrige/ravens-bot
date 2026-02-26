-- CreateTable
CREATE TABLE "BotMessage" (
    "type" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("type")
);
