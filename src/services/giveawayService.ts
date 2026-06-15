import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	EmbedBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextChannel,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	getGiveawayById,
	getAllGiveaways,
	GiveawayRecord,
	mutateGiveaways,
} from "../utils/giveawayStore";
import { CHANNEL_IDS } from "../config/channels";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	MediaGallery: 12,
	Separator: 14,
	Button: 2,
} as const;

const KYIV_TIMEZONE = "Europe/Kyiv";
const DEFAULT_TEMPLATE = "sentice";

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

function formatDiscordTimestamp(value: Date | string, style: "f" | "F" | "R" = "f") {
	const date = new Date(value);
	return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
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

function formatConditionsText(raw: string | null) {
	if (!raw) return null;

	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (!lines.length) return null;
	if (lines.length === 1) return lines[0];

	return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function formatGiveawayAccessRole(roleId: string | null | undefined) {
	return roleId ? `<@&${roleId}>` : "@everyone";
}

function buildStatusLine(giveaway: GiveawayRecord, now = new Date()) {
	if (giveaway.ended) return "🔴 Завершен";

	const endAt = new Date(giveaway.endAt);
	const leftMs = endAt.getTime() - now.getTime();
	if (leftMs <= 0) return "🔴 Завершается";

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

function getKyivNowParts(now = new Date()) {
	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone: KYIV_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	const map = Object.fromEntries(
		formatter.formatToParts(now).map((part) => [part.type, part.value])
	);

	return {
		year: Number(map.year),
		month: Number(map.month),
		day: Number(map.day),
		hour: Number(map.hour),
		minute: Number(map.minute),
		second: Number(map.second),
	};
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	const map = Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value])
	);

	const asUtc = Date.UTC(
		Number(map.year),
		Number(map.month) - 1,
		Number(map.day),
		Number(map.hour),
		Number(map.minute),
		Number(map.second)
	);

	return asUtc - date.getTime();
}

function createKyivDate(year: number, month: number, day: number, hour: number, minute: number) {
	const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
	const offset = getTimeZoneOffsetMs(guess, KYIV_TIMEZONE);
	return new Date(guess.getTime() - offset);
}

export function parseGiveawayEndTime(input: string, now = new Date()) {
	const value = input.trim();
	const relativeMatch = value.match(/^(\d+)\s*([mhd])$/i);

	if (relativeMatch) {
		const amount = Number(relativeMatch[1]);
		const unit = relativeMatch[2].toLowerCase();

		if (!Number.isFinite(amount) || amount <= 0) return null;

		const ms =
			unit === "m" ? amount * 60_000 :
			unit === "h" ? amount * 60 * 60_000 :
			amount * 24 * 60 * 60_000;

		return new Date(now.getTime() + ms);
	}

	const timeOnlyMatch = value.match(/^(\d{1,2}):(\d{2})$/);
	if (timeOnlyMatch) {
		const hour = Number(timeOnlyMatch[1]);
		const minute = Number(timeOnlyMatch[2]);
		if (hour > 23 || minute > 59) return null;

		const parts = getKyivNowParts(now);
		let date = createKyivDate(parts.year, parts.month, parts.day, hour, minute);
		if (date.getTime() <= now.getTime()) {
			date = new Date(date.getTime() + 24 * 60 * 60_000);
		}
		return date;
	}

	const shortDateMatch = value.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\.(\d{1,2})$/);
	if (shortDateMatch) {
		const hour = Number(shortDateMatch[1]);
		const minute = Number(shortDateMatch[2]);
		const day = Number(shortDateMatch[3]);
		const month = Number(shortDateMatch[4]);
		if (hour > 23 || minute > 59 || day < 1 || day > 31 || month < 1 || month > 12) return null;

		const parts = getKyivNowParts(now);
		let date = createKyivDate(parts.year, month, day, hour, minute);
		if (date.getTime() <= now.getTime()) {
			date = createKyivDate(parts.year + 1, month, day, hour, minute);
		}
		return date;
	}

	const fullDateMatch = value.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (fullDateMatch) {
		const hour = Number(fullDateMatch[1]);
		const minute = Number(fullDateMatch[2]);
		const day = Number(fullDateMatch[3]);
		const month = Number(fullDateMatch[4]);
		const year = Number(fullDateMatch[5]);
		if (hour > 23 || minute > 59 || day < 1 || day > 31 || month < 1 || month > 12) return null;

		return createKyivDate(year, month, day, hour, minute);
	}

	return null;
}

export function createGiveawayId() {
	return `gw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function buildGiveawayPanel(giveaway: GiveawayRecord, now = new Date()) {
	const endAt = new Date(giveaway.endAt);
	const isExpired = giveaway.ended || endAt.getTime() <= now.getTime();
	const participantsCount = giveaway.participants.length;
	const formattedConditions = formatConditionsText(giveaway.description);
	const winnersBlock =
		giveaway.ended && giveaway.winners.length > 0
			? `### Победители\n${giveaway.winners.map((userId) => `• <@${userId}>`).join("\n")}`
			: giveaway.ended
				? "### Победители\nУчастников для выбора победителя не было."
				: null;

	const components: any[] = [];

	components.push(
		{ type: V2.TextDisplay, content: `## РОЗЫГРЫШ: ${giveaway.prize}` },
	);

	if (giveaway.imageUrl) {
		components.push({
			type: V2.MediaGallery,
			items: [
				{
					media: { url: giveaway.imageUrl },
				},
			],
		});
	}

	components.push(
		{
			type: V2.TextDisplay,
			content: [
				`**Статус:** ${buildStatusLine(giveaway, now)}`,
				`**Победителей:** ${giveaway.winnersCount}`,
				`**Участников:** ${participantsCount}`,
				`**Доступ:** ${formatGiveawayAccessRole(giveaway.roleId)}`,
				`**Закрытие:** ${formatDiscordTimestamp(endAt, "f")}`,
				`**Организатор:** <@${giveaway.creatorId}>`,
			].join("\n"),
		},
	);

	if (formattedConditions) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: `### Условия участия\n${formattedConditions}` }
		);
	}

	if (winnersBlock) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: winnersBlock }
		);
	}

	components.push(
		{ type: V2.Separator },
		{ type: V2.TextDisplay, content: `-# Создано ${formatDiscordTimestamp(giveaway.createdAt, "f")}` }
	);

	return [
		{ type: V2.Container, components },
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Success)
				.setLabel("Участвовать")
				.setCustomId(`${CUSTOM_IDS.GIVEAWAY_JOIN}${giveaway.id}`)
				.setDisabled(isExpired)
		),
	];
}

function getGiveawayMessageLink(giveaway: GiveawayRecord) {
	return `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
}

async function getGiveawayChannel(client: Client, giveaway: GiveawayRecord) {
	const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

async function getPublishGiveawayChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_GIVEAWAY).catch(() => null);
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

export async function syncGiveawayMessage(client: Client, giveaway: GiveawayRecord) {
	const channel = await getGiveawayChannel(client, giveaway);
	if (!channel) return false;

	try {
		const message = await channel.messages.fetch(giveaway.messageId);
		await message.edit({
			components: buildGiveawayPanel(giveaway),
		});
		return true;
	} catch (error) {
		console.warn("[giveaway] failed to sync message:", error);
		return false;
	}
}

async function sendWinnerAnnouncement(client: Client, giveaway: GiveawayRecord, reroll = false) {
	const channel = await getGiveawayChannel(client, giveaway);
	if (!channel) return false;

	const winnersText =
		giveaway.winners.length > 0
			? giveaway.winners.map((userId) => `<@${userId}>`).join(", ")
			: "победителей нет, участников не было";
	const formattedConditions = formatConditionsText(giveaway.description);

	try {
		const embed = new EmbedBuilder()
			.setColor(reroll ? 0x5865f2 : 0x57f287)
			.setTitle(reroll ? "Реролл завершён" : "Розыгрыш завершён")
			.addFields(
				{ name: "Приз", value: giveaway.prize, inline: false },
				{ name: "Победители", value: winnersText, inline: false },
				{ name: "Ссылка на розыгрыш", value: `[Открыть сообщение](${getGiveawayMessageLink(giveaway)})`, inline: false },
			)
			.setTimestamp(new Date());

		if (giveaway.imageUrl) {
			embed.setImage(giveaway.imageUrl);
		}

		if (formattedConditions) {
			embed.addFields({
				name: "Условия участия",
				value: formattedConditions,
				inline: false,
			});
		}

		embed.addFields({
			name: "Доступ",
			value: formatGiveawayAccessRole(giveaway.roleId),
			inline: false,
		});

		const announcement = await channel.send({
			embeds: [embed],
		});

		if (!reroll) {
			await mutateGiveaways((records) => {
				const existing = records.find((record) => record.id === giveaway.id);
				if (!existing) return;
				existing.announcementSent = true;
				existing.announcementMessageId = announcement.id;
			});
		}

		return true;
	} catch (error) {
		console.warn("[giveaway] failed to send winner announcement:", error);
		return false;
	}
}

export async function createGiveaway(client: Client, input: {
	creatorId: string;
	guildId: string;
	prize: string;
	imageUrl: string | null;
	description: string;
	winnersCount: number;
	endAt: Date;
	roleId: string | null;
}) {
	const channel = await getPublishGiveawayChannel(client);
	if (!channel) return { ok: false as const, reason: "channel_not_found" };

	const id = createGiveawayId();
	const draftGiveaway: GiveawayRecord = {
		id,
		guildId: input.guildId,
		channelId: channel.id,
		messageId: "pending",
		creatorId: input.creatorId,
		prize: input.prize,
		imageUrl: input.imageUrl,
		description: input.description || null,
		roleId: input.roleId,
		winnersCount: input.winnersCount,
		endAt: input.endAt.toISOString(),
		template: DEFAULT_TEMPLATE,
		participants: [],
		winners: [],
		ended: false,
		announcementSent: false,
		announcementMessageId: null,
		createdAt: new Date().toISOString(),
		endedAt: null,
	};

	await channel.send(
		input.roleId
			? {
				content: `<@&${input.roleId}>`,
				allowedMentions: { roles: [input.roleId] },
			}
			: {
				content: "@everyone",
				allowedMentions: { parse: ["everyone"] },
			}
	);

	const sent = await channel.send({
		...buildGiveawaySendPayload(draftGiveaway),
	});

	await mutateGiveaways((records) => {
		records.push({ ...draftGiveaway, messageId: sent.id });
	});

	return { ok: true as const, giveaway: { ...draftGiveaway, messageId: sent.id }, channelId: channel.id };
}

export async function rerollGiveaway(
	client: Client,
	giveawayId: string
): Promise<GiveawayRecord | null> {
	let rerolled: GiveawayRecord | null = null;

	await mutateGiveaways((records) => {
		const existing = records.find((record) => record.id === giveawayId);
		if (!existing || !existing.ended) return;

		existing.winners = pickWinners(existing.participants, existing.winnersCount);
		rerolled = { ...existing };
	});

	if (!rerolled) return null;

	await syncGiveawayMessage(client, rerolled);
	await sendWinnerAnnouncement(client, rerolled, true);
	return rerolled;
}

export async function finalizeGiveaway(
	client: Client,
	giveawayId: string
): Promise<GiveawayRecord | null> {
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
		components: buildGiveawayPanel(giveaway, new Date()),
	};

	return payload;
}

export async function buildEndedGiveawaySelectOptions() {
	const giveaways = await getAllGiveaways();
	return giveaways
		.filter((giveaway) => giveaway.ended)
		.sort((a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime())
		.slice(0, 25)
		.map((giveaway) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(giveaway.prize.slice(0, 100))
				.setDescription(
					`Окончание: ${formatDateTime(new Date(giveaway.endAt))} • победителей: ${giveaway.winnersCount}`.slice(0, 100)
				)
				.setValue(giveaway.id)
		);
}

export function buildEndedGiveawaySelect(options: StringSelectMenuOptionBuilder[]) {
	return new StringSelectMenuBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_PANEL_REROLL_SELECT)
		.setPlaceholder("Выбери завершённый розыгрыш")
		.addOptions(options);
}
