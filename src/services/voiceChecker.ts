import { config } from "../config/env";
import {Prisma} from "../generated/prisma/client";
import {prisma} from "../utils/prisma";
import {xpForNextLevel} from "../utils/xpForNextLevel";

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

	// ===== НАЧИСЛЕНИЕ МОНЕТ (0.0333 за минуту) =====
	const minutes = Math.floor(timeSpentMs / 60000);
	if (minutes <= 0) return;
	const XP_PER_MINUTE = 2;
	const xpToAdd = BigInt(minutes * XP_PER_MINUTE);

	const coinsToAdd = new Prisma.Decimal(minutes * 0.0333); // Decimal хранит дробные монеты

	const updated = await prisma.user.upsert({
		where: { id: userId },
		update: {
			timeInVoice: { increment: timeSpent },
			balance: { increment: coinsToAdd },
			xp: { increment: xpToAdd }
		},
		create: {
			id: userId,
			timeInVoice: timeSpent,
			balance: coinsToAdd,
			xp: xpToAdd,
			level: 0,
			messageCount: 0n
		}
	});

// левелап
	let level = updated.level;
	let xp = Number(updated.xp ?? 0n);
	let need = xpForNextLevel(level);

	let leveledUp = false;
	while (xp >= need) {
		xp -= need;
		level += 1;
		need = xpForNextLevel(level);
		leveledUp = true;
	}

	if (leveledUp) {
		await prisma.user.update({
			where: { id: userId },
			data: { level, xp: BigInt(xp) }
		});
	}
}