import { config } from "../config/env";
import {Prisma} from "../generated/prisma/client";
import {prisma} from "../utils/prisma";

// userId -> { joinTime, guildId, channelId }
const voiceTracker = new Map<string, { joinTime: number; guildId: string; channelId: string }>();

export function initVoiceTracker(client: any) {
	client.on("voiceStateUpdate", async (oldState: any, newState: any) => {
		const userId = newState.id;

		// ===== ВХОД В ВОЙС =====
		if (!oldState.channelId && newState.channelId) {
			voiceTracker.set(userId, {
				joinTime: Date.now(),
				guildId: newState.guild.id,
				channelId: newState.channelId
			});
			return;
		}

		// ===== ВЫХОД ИЗ ВОЙСА =====
		if (oldState.channelId && !newState.channelId) {
			await handleLeave(userId, oldState, client);
			return;
		}

		// ===== ПЕРЕХОД МЕЖДУ КАНАЛАМИ =====
		if (
			oldState.channelId &&
			newState.channelId &&
			oldState.channelId !== newState.channelId
		) {
			await handleLeave(userId, oldState, client);

			voiceTracker.set(userId, {
				joinTime: Date.now(),
				guildId: newState.guild.id,
				channelId: newState.channelId
			});
		}
	});
}

async function handleLeave(userId: string, oldState: any, client: any) {
	const data = voiceTracker.get(userId);
	if (!data) return;

	const { joinTime, guildId, channelId } = data;
	voiceTracker.delete(userId);

	const guild = client.guilds.cache.get(guildId);
	if (!guild) return;

	const channel = guild.channels.cache.get(channelId);
	if (!channel) return;

	const member = guild.members.cache.get(userId);
	if (!member) return;

	const timeSpentMs = Date.now() - joinTime;
	const timeSpent = BigInt(timeSpentMs);

	// ===== АНТИ-АБУЗ ПРОВЕРКИ =====
	if (config.FAMILY_AFK_CHANNEL_ID && channelId === config.FAMILY_AFK_CHANNEL_ID) return;
	if (channel.members.size < 2) return;
	if (member.voice.selfMute || member.voice.selfDeaf) return;
	if (timeSpent < 15_000n) return;

	// ===== НАЧИСЛЕНИЕ МОНЕТ (0.1 за минуту) =====
	const minutes = Math.floor(timeSpentMs / 60000);
	if (minutes <= 0) return;

	const coinsToAdd = new Prisma.Decimal(minutes * 0.1); // Decimal хранит дробные монеты

	await prisma.user.upsert({
		where: { id: userId },
		update: {
			timeInVoice: { increment: timeSpent },
			balance: { increment: coinsToAdd }
		},
		create: {
			id: userId,
			timeInVoice: timeSpent,
			balance: coinsToAdd
		}
	});
}