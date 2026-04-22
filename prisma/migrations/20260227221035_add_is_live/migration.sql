-- DropIndex
DROP INDEX "Streamer_guildId_twitchLogin_key";

-- AlterTable
ALTER TABLE "Streamer" ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false;
