import { ChannelType, Client, VoiceState } from "discord.js";
import { config } from "../config/env";
import { prisma } from "../utils/prisma";

type ActiveInterviewSession = {
	applicationId: bigint;
	userId: string;
	channelId: string;
	joinedAt: number;
};

const activeSessions = new Map<string, ActiveInterviewSession>();
const accumulatedMs = new Map<string, number>();

function getAccumulatorKey(applicationId: bigint, userId: string) {
	return `${applicationId.toString()}:${userId}`;
}

function isRecruitInterviewVoice(state: VoiceState) {
	return (
		state.channel?.type === ChannelType.GuildVoice &&
		state.channel.parentId === config.FAMILY_RECRUIT_CATEGORY_ID &&
		state.channel.name.startsWith("обзвон-")
	);
}

async function findActiveCalledApplication(userId: string) {
	return prisma.application.findFirst({
		where: {
			userId,
			isAccepted: null,
			callTakenById: { not: null },
		},
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			userId: true,
		},
	});
}

function flushSession(userId: string, timestamp = Date.now()) {
	const session = activeSessions.get(userId);
	if (!session) return;

	activeSessions.delete(userId);
	const delta = Math.max(0, timestamp - session.joinedAt);
	const key = getAccumulatorKey(session.applicationId, session.userId);
	accumulatedMs.set(key, (accumulatedMs.get(key) ?? 0) + delta);
}

async function handleInterviewVoiceJoin(newState: VoiceState) {
	if (!isRecruitInterviewVoice(newState)) return;

	const application = await findActiveCalledApplication(newState.id);
	if (!application) return;

	activeSessions.set(newState.id, {
		applicationId: application.id,
		userId: application.userId,
		channelId: newState.channelId!,
		joinedAt: Date.now(),
	});
}

async function handleInterviewVoiceTransition(oldState: VoiceState, newState: VoiceState) {
	const wasTracked = activeSessions.has(oldState.id);

	if (wasTracked && oldState.channelId !== newState.channelId) {
		flushSession(oldState.id);
	}

	if (newState.channelId) {
		await handleInterviewVoiceJoin(newState);
	}
}

export function initFamilyInterviewVoiceTracker(client: Client) {
	client.on("voiceStateUpdate", async (oldState, newState) => {
		try {
			if (!newState.guild || newState.guild.id !== config.FAMILY_SERVER_GUID) return;

			if (!oldState.channelId && newState.channelId) {
				await handleInterviewVoiceJoin(newState);
				return;
			}

			if (oldState.channelId && !newState.channelId) {
				flushSession(oldState.id);
				return;
			}

			if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
				await handleInterviewVoiceTransition(oldState, newState);
			}
		} catch (error) {
			console.error("[familyInterviewVoiceTracker] voiceStateUpdate error:", error);
		}
	});
}

export function consumeFamilyInterviewVoiceMs(applicationId: bigint, userId: string) {
	flushSession(userId);
	const key = getAccumulatorKey(applicationId, userId);
	const total = accumulatedMs.get(key) ?? 0;
	accumulatedMs.delete(key);
	return total;
}

export function formatFamilyInterviewVoiceDuration(totalMs: number) {
	if (totalMs <= 0) return "0м";

	const totalSeconds = Math.floor(totalMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}ч`);
	if (minutes > 0) parts.push(`${minutes}м`);
	if (seconds > 0 || !parts.length) parts.push(`${seconds}с`);
	return parts.join(" ");
}
