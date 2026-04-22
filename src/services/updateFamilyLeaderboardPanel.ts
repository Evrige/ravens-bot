import { Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { config } from "../config/env";
import { formatTime } from "../utils/time";

const BOT_MSG_TYPE = "family_leaderboard_panel";

const V2 = {
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

function formatCoins(value: any) {
	const amount = typeof value?.toNumber === "function" ? value.toNumber() : Number(value ?? 0);
	return `${amount.toFixed(2)} 🪙`;
}

function getPlaceBadge(index: number) {
	const badges = ["🥇", "🥈", "🥉"];
	return badges[index] ?? `\`${index + 1}.\``;
}

async function resolveGuildTopUsers(
	client: Client,
	orderBy: "balance" | "timeInVoice",
	take = 10
) {
	const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
	if (!guild) return [];

	const users = await prisma.user.findMany({
		where:
			orderBy === "balance"
				? { balance: { gt: 0 } }
				: { timeInVoice: { gt: 0n } },
		orderBy: { [orderBy]: "desc" },
		take: 50,
	});

	const resolved = await Promise.all(
		users.map(async (user) => {
			const member = await guild.members.fetch(user.id).catch(() => null);
			if (!member) return null;

			return {
				id: user.id,
				displayName: member.displayName || member.user.globalName || member.user.username,
				balance: user.balance,
				timeInVoice: user.timeInVoice,
			};
		})
	);

	return resolved.filter(Boolean).slice(0, take) as Array<{
		id: string;
		displayName: string;
		balance: any;
		timeInVoice: bigint;
	}>;
}

function buildTopLines(
	entries: Array<{ id: string; displayName: string; balance: any; timeInVoice: bigint }>,
	type: "coins" | "voice"
) {
	if (!entries.length) {
		return type === "coins"
			? "Пока нет участников с коинами."
			: "Пока нет участников с войс-активностью.";
	}

	return entries
		.map((entry, index) => {
			const value =
				type === "coins" ? formatCoins(entry.balance) : formatTime(entry.timeInVoice);
			return `${getPlaceBadge(index)} <@${entry.id}> — **${value}**`;
		})
		.join("\n");
}

function buildLeaderboardPanel(options: {
	coinsTop: Array<{ id: string; displayName: string; balance: any; timeInVoice: bigint }>;
	voiceTop: Array<{ id: string; displayName: string; balance: any; timeInVoice: bigint }>;
}) {
	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Лидерборд Ravens" },
			{
				type: V2.TextDisplay,
				content: "Топ участников семьи по количеству коинов и времени в голосовых каналах.",
			},
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Топ-10 по коинам" },
			{ type: V2.TextDisplay, content: buildTopLines(options.coinsTop, "coins") },
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Топ-10 по голосовой активности" },
			{ type: V2.TextDisplay, content: buildTopLines(options.voiceTop, "voice") },
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `-# Обновлено: ${new Intl.DateTimeFormat("ru-RU", {
					timeZone: "Europe/Kiev",
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				}).format(new Date())}`,
			},
		],
	};
}

export async function updateFamilyLeaderboardPanel(client: Client) {
	const fetchedChannel = await client.channels.fetch(CHANNEL_IDS.FAMILY_LEADERBOARD).catch(() => null);
	if (!fetchedChannel || !fetchedChannel.isTextBased()) return;
	const channel = fetchedChannel as TextChannel;

	const [coinsTop, voiceTop] = await Promise.all([
		resolveGuildTopUsers(client, "balance"),
		resolveGuildTopUsers(client, "timeInVoice"),
	]);

	const container = buildLeaderboardPanel({ coinsTop, voiceTop });
	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [container],
	};
	const payloadEdit: any = {
		components: [container],
	};

	const botMsg = await prisma.botMessage.findUnique({
		where: { type: BOT_MSG_TYPE },
	});

	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const message = await channel.messages.fetch(botMsg.messageId);
			await message.edit(payloadEdit);
			return;
		} catch (error: any) {
			if (error?.code !== 10008) {
				console.warn("family leaderboard edit failed, recreating:", error);
			}
		}
	}

	const sent = await channel.send(payloadSend);

	await prisma.botMessage.upsert({
		where: { type: BOT_MSG_TYPE },
		update: { messageId: sent.id, channelId: channel.id },
		create: { type: BOT_MSG_TYPE, messageId: sent.id, channelId: channel.id },
	});
}
