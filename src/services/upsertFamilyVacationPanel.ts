import {
	ButtonStyle,
	ChannelType,
	Client,
	Message,
	MessageFlags,
	PublicThreadChannel,
	TextChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";

const TYPE = "family_vacation_panel";
const THREAD_TYPE = "family_vacation_panel_logs";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Separator: 14,
	Button: 2,
} as const;

function buildVacationPanel() {
	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Отпуск" },
			{ type: V2.TextDisplay, content: "> Здесь можно оформить отпуск с указанием причины и даты окончания." },
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"**Кнопки:**",
					"• **Уйти в отпуск** — откроется форма с причиной и сроком отпуска",
					"• **Список отпусков** — покажет активные отпуска",
					"• **Вернуться из отпуска** — завершить отпуск досрочно",
					"",
					"**Форматы даты окончания:**",
					"• `HH:MM DD.MM.YYYY`",
					"• `HH:MM DD.MM`",
					"• `HH:MM`",
					"• `10m`, `2h`, `3d`",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Оформить отпуск" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Уйти в отпуск",
					custom_id: CUSTOM_IDS.FAMILY_VACATION_ENTER,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Посмотреть активные отпуска" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Список отпусков",
					custom_id: CUSTOM_IDS.FAMILY_VACATION_LIST,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Вернуться из отпуска раньше срока" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Вернуться из отпуска",
					custom_id: CUSTOM_IDS.FAMILY_VACATION_EXIT,
				},
			},
		],
	};
}

async function getVacationChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_VACATION).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel as TextChannel;
}

async function fetchStoredMessage(channel: TextChannel) {
	const stored = await prisma.botMessage.findUnique({ where: { type: TYPE } });
	if (!stored) return null;

	const existingChannel = await channel.client.channels.fetch(stored.channelId).catch(() => null);
	if (!existingChannel || existingChannel.type !== ChannelType.GuildText) return null;

	return (existingChannel as TextChannel).messages.fetch(stored.messageId).catch(() => null);
}

async function ensureLogsThread(message: Message) {
	const stored = await prisma.botMessage.findUnique({ where: { type: THREAD_TYPE } });

	if (stored) {
		const existing = await message.client.channels.fetch(stored.channelId).catch(() => null);
		if (existing?.isThread()) {
			return existing as PublicThreadChannel;
		}
	}

	const thread = await message.startThread({
		name: "Vacation-logs",
		autoArchiveDuration: 10080,
		reason: "Логи панели отпуска",
	}).catch(() => null);

	if (!thread) return null;

	await prisma.botMessage.upsert({
		where: { type: THREAD_TYPE },
		update: { messageId: message.id, channelId: thread.id },
		create: { type: THREAD_TYPE, messageId: message.id, channelId: thread.id },
	});

	const messages = await thread.messages.fetch({ limit: 5 }).catch(() => null);
	if (!messages || messages.size === 0) {
		await thread.send("В этой ветке будут логи по отпускам.").catch(() => {});
	}

	return thread;
}

export async function getFamilyVacationLogsThread(client: Client) {
	const stored = await prisma.botMessage.findUnique({ where: { type: THREAD_TYPE } });
	if (!stored) return null;

	const existing = await client.channels.fetch(stored.channelId).catch(() => null);
	if (!existing?.isThread()) return null;

	return existing as PublicThreadChannel;
}

export async function upsertFamilyVacationPanel(client: Client, forceRepost = false) {
	const channel = await getVacationChannel(client);
	if (!channel) {
		return { ok: false as const, reason: "channel_not_found" as const };
	}

	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildVacationPanel()],
	};
	const payloadEdit: any = {
		components: [buildVacationPanel()],
	};

	let message = await fetchStoredMessage(channel);

	if (forceRepost && message) {
		await message.delete().catch(() => {});
		message = null;
	}

	if (message) {
		await message.edit(payloadEdit).catch(() => {});
		await ensureLogsThread(message);
		return { ok: true as const, mode: "edited" as const, messageId: message.id };
	}

	const sent = await channel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: TYPE },
		update: { channelId: sent.channel.id, messageId: sent.id },
		create: { type: TYPE, channelId: sent.channel.id, messageId: sent.id },
	});

	await ensureLogsThread(sent);

	return { ok: true as const, mode: "created" as const, messageId: sent.id };
}
