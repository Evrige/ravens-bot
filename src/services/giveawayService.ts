import {
	ButtonStyle,
	Client,
	MessageFlags,
	TextChannel,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	getGiveawayById,
	getAllGiveaways,
	GiveawayRecord,
	mutateGiveaways,
} from "../utils/giveawayStore";
import { GIVEAWAY_TEMPLATES } from "../config/giveawayTemplates";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Separator: 14,
	Button: 2,
} as const;

const KYIV_TIMEZONE = "Europe/Kyiv";

function formatDateTime(date: Date) {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: KYIV_TIMEZONE,
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatDuration(ms: number) {
	if (ms <= 0) return "время вышло";

	const totalMinutes = Math.ceil(ms / 60_000);
	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];

	if (days > 0) parts.push(`${days}д`);
	if (hours > 0) parts.push(`${hours}ч`);
	if (minutes > 0 || parts.length === 0) parts.push(`${minutes}м`);

	return parts.join(" ");
}

function buildStatusLine(giveaway: GiveawayRecord, now = new Date()) {
	if (giveaway.ended) {
		return "🔴 Завершен";
	}

	const endAt = new Date(giveaway.endAt);
	const leftMs = endAt.getTime() - now.getTime();
	if (leftMs <= 0) {
		return "🔴 Завершается";
	}

	return `🟢 Активен • до конца ${formatDuration(leftMs)}`;
}

function pickWinners(participants: string[], winnersCount: number) {
	const pool = [...participants];

	for (let index = pool.length - 1; index > 0; index -= 1) {
		const randomIndex = Math.floor(Math.random() * (index + 1));
		[pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
	}

	return pool.slice(0, Math.min(winnersCount, pool.length));
}

export function buildGiveawayPanel(giveaway: GiveawayRecord, now = new Date()) {
	const template = GIVEAWAY_TEMPLATES[giveaway.template];
	const endAt = new Date(giveaway.endAt);
	const isExpired = giveaway.ended || endAt.getTime() <= now.getTime();
	const participantsCount = giveaway.participants.length;
	const winnersBlock =
		giveaway.ended && giveaway.winners.length > 0
			? `### Победители\n${giveaway.winners.map((userId) => `• <@${userId}>`).join("\n")}`
			: giveaway.ended
				? "### Победители\nУчастников для выбора победителя не было."
				: null;

	const components: any[] = [
		{
			type: V2.TextDisplay,
			content: `## ${template.icon} GIVEAWAY • ${template.label}`,
		},
		{
			type: V2.TextDisplay,
			content: `**Приз:** ${giveaway.prize}`,
		},
		{
			type: V2.TextDisplay,
			content: [
				`**Статус:** ${buildStatusLine(giveaway, now)}`,
				`**Победителей:** ${giveaway.winnersCount}`,
				`**Участников:** ${participantsCount}`,
				`**Закрытие:** ${formatDateTime(endAt)}`,
				`**Организатор:** <@${giveaway.creatorId}>`,
				`**Шаблон:** ${template.accent}`,
			].join("\n"),
		},
	];

	if (giveaway.description) {
		components.push(
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `### Описание\n${giveaway.description}`,
			}
		);
	}

	if (winnersBlock) {
		components.push(
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: winnersBlock,
			}
		);
	}

	components.push(
		{ type: V2.Separator },
		{
			type: V2.Section,
			components: [
				{
					type: V2.TextDisplay,
					content: isExpired
						? "Розыгрыш закрыт. Кнопка участия больше недоступна."
						: "Нажми на кнопку справа, чтобы записаться в розыгрыш.",
				},
			],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				label: `${template.buttonLabel} • ${participantsCount}`,
				custom_id: `${CUSTOM_IDS.GIVEAWAY_JOIN}${giveaway.id}`,
				disabled: isExpired,
			},
		},
		{
			type: V2.TextDisplay,
			content: `-# Создано ${formatDateTime(new Date(giveaway.createdAt))}`,
		}
	);

	return {
		type: V2.Container,
		components,
	};
}

function getGiveawayMessageLink(giveaway: GiveawayRecord) {
	return `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
}

async function getGiveawayChannel(client: Client, giveaway: GiveawayRecord) {
	const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

export async function syncGiveawayMessage(client: Client, giveaway: GiveawayRecord) {
	const channel = await getGiveawayChannel(client, giveaway);
	if (!channel) return false;

	try {
		const message = await channel.messages.fetch(giveaway.messageId);
		await message.edit({
			components: [buildGiveawayPanel(giveaway)],
		});
		return true;
	} catch (error) {
		console.warn("[giveaway] failed to sync message:", error);
		return false;
	}
}

async function sendWinnerAnnouncement(client: Client, giveaway: GiveawayRecord) {
	if (giveaway.announcementSent) return true;

	const channel = await getGiveawayChannel(client, giveaway);
	if (!channel) return false;

	const winnersText =
		giveaway.winners.length > 0
			? giveaway.winners.map((userId) => `<@${userId}>`).join(", ")
			: "победителей нет, участников не было";

	try {
		const announcement = await channel.send({
			content: [
				"🎉 **Розыгрыш завершен!**",
				`Приз: **${giveaway.prize}**`,
				`Победители: ${winnersText}`,
				`Ссылка на розыгрыш: ${getGiveawayMessageLink(giveaway)}`,
			].join("\n"),
		});

		await mutateGiveaways((records) => {
			const existing = records.find((record) => record.id === giveaway.id);
			if (!existing) return;
			existing.announcementSent = true;
			existing.announcementMessageId = announcement.id;
		});

		return true;
	} catch (error) {
		console.warn("[giveaway] failed to send winner announcement:", error);
		return false;
	}
}

export async function finalizeGiveaway(client: Client, giveawayId: string) {
	let finalized: GiveawayRecord | null = null;

	await mutateGiveaways((records) => {
		const existing = records.find((record) => record.id === giveawayId);
		if (!existing) return;

		if (!existing.ended) {
			existing.ended = true;
			existing.endedAt = new Date().toISOString();
			existing.winners = pickWinners(existing.participants, existing.winnersCount);
		}

		finalized = { ...existing };
	});

	if (!finalized) return null;

	await syncGiveawayMessage(client, finalized);
	await sendWinnerAnnouncement(client, finalized);

	return finalized;
}

export async function refreshGiveawayState(client: Client, giveawayId: string) {
	const giveaway = await getGiveawayById(giveawayId);
	if (!giveaway) return null;

	if (!giveaway.ended && new Date(giveaway.endAt).getTime() <= Date.now()) {
		return finalizeGiveaway(client, giveawayId);
	}

	if (giveaway.ended && !giveaway.announcementSent) {
		await sendWinnerAnnouncement(client, giveaway);
	}

	if (!giveaway.ended) {
		await syncGiveawayMessage(client, giveaway);
	}

	return giveaway;
}

export async function refreshAllGiveaways(client: Client) {
	const giveaways = await getAllGiveaways();

	for (const giveaway of giveaways) {
		if (!giveaway.ended && new Date(giveaway.endAt).getTime() <= Date.now()) {
			await finalizeGiveaway(client, giveaway.id);
			continue;
		}

		if (giveaway.ended && !giveaway.announcementSent) {
			await sendWinnerAnnouncement(client, giveaway);
			continue;
		}

		if (!giveaway.ended) {
			await syncGiveawayMessage(client, giveaway);
		}
	}
}

export function buildGiveawaySendPayload(giveaway: GiveawayRecord) {
	const payload: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildGiveawayPanel(giveaway)],
	};

	return payload;
}
