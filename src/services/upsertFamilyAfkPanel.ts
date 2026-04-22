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

const TYPE = "family_afk_panel";
const THREAD_TYPE = "family_afk_panel_logs";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Separator: 14,
	Button: 2,
} as const;

function buildAfkPanel() {
	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## AFK панель" },
			{ type: V2.TextDisplay, content: "> Уход в AFK до 24 часов." },
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"**Кнопки:**",
					"• **Уйти в AFK** — откроется модалка для ввода времени и причины",
					"• **Список AFK** — покажет текущий список (только вам)",
					"• **Выйти из AFK** — завершить AFK досрочно",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Управление AFK" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Уйти в AFK",
					custom_id: CUSTOM_IDS.FAMILY_AFK_ENTER,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Посмотреть активные AFK" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Список AFK",
					custom_id: CUSTOM_IDS.FAMILY_AFK_LIST,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Завершить AFK досрочно" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Выйти из AFK",
					custom_id: CUSTOM_IDS.FAMILY_AFK_EXIT,
				},
			},
		],
	};
}

async function getAfkChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_AFK_MEMBERS).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel as TextChannel;
}

async function fetchStoredMessage(channel: TextChannel) {
	const stored = await prisma.botMessage.findUnique({ where: { type: TYPE } });
	if (!stored) return null;

	const existingChannel = await channel.client.channels.fetch(stored.channelId).catch(() => null);
	if (!existingChannel || existingChannel.type !== ChannelType.GuildText) return null;

	const message = await (existingChannel as TextChannel).messages.fetch(stored.messageId).catch(() => null);
	return message;
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
		name: "AFK-logs",
		autoArchiveDuration: 10080,
		reason: "Логи AFK панели",
	}).catch(() => null);

	if (!thread) return null;

	await prisma.botMessage.upsert({
		where: { type: THREAD_TYPE },
		update: { messageId: message.id, channelId: thread.id },
		create: { type: THREAD_TYPE, messageId: message.id, channelId: thread.id },
	});

	const messages = await thread.messages.fetch({ limit: 5 }).catch(() => null);
	if (!messages || messages.size === 0) {
		await thread.send("В этой ветке будут логи по AFK-панели.").catch(() => {});
	}

	return thread;
}

export async function getFamilyAfkLogsThread(client: Client) {
	const stored = await prisma.botMessage.findUnique({ where: { type: THREAD_TYPE } });
	if (!stored) return null;

	const existing = await client.channels.fetch(stored.channelId).catch(() => null);
	if (!existing?.isThread()) return null;

	return existing as PublicThreadChannel;
}

export async function upsertFamilyAfkPanel(client: Client, forceRepost = false) {
	const channel = await getAfkChannel(client);
	if (!channel) {
		return { ok: false as const, reason: "channel_not_found" as const };
	}

	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildAfkPanel()],
	};
	const payloadEdit: any = {
		components: [buildAfkPanel()],
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
