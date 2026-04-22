-- CreateTable
CREATE TABLE "Streamer" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "twitchUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Streamer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_guildId_twitchLogin_key" ON "Streamer"("guildId", "twitchLogin");
