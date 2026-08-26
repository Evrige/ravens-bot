import {
	AttachmentBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	MessageFlags,
	TextChannel,
} from "discord.js";
import path from "path";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { FAMILY_LONDEST_ROLE_IDS } from "../config/staff";

const TYPE = "family_promo_panel";
const MEDIA_TYPE = "family_media_panel";

const V2 = {
	ActionRow: 1,
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Separator: 14,
	Button: 2,
	MediaGallery: 12,
} as const;

const LONDEST_PAYMENT_AMOUNT = "350.000$";
const PROMO_BUTTON_LABEL = "💸 Я пополнил счёт семьи";
const MEDIA_BUTTON_LABEL = "Хочу стать медиа";

const PROMO_IMAGE_NAMES = ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png"];
const PROMO_IMAGE_PATHS = PROMO_IMAGE_NAMES.map((name) =>
	path.join(process.cwd(), "assets", "promo", name)
);

const LONDEST_ROLE_MENTION = FAMILY_LONDEST_ROLE_IDS[0]
	? `<@&${FAMILY_LONDEST_ROLE_IDS[0]}>`
	: "Londest Londo";

function buildPromoPanel() {
	return {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content: "## Деньги · Автопарк · Londest Londo",
			},
			{
				type: V2.TextDisplay,
				content:
					`Вы можете получить доступ к автопарку семьи с рангом ${LONDEST_ROLE_MENTION}`,
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content:
					"> Этот ранг создан для людей, которые финансово поддерживают семью и помогают развивать общий счёт.",
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"**Для получения ранга Londest Londo вам нужно:**",
					`1. Положить на счёт семьи **${LONDEST_PAYMENT_AMOUNT}**`,
					"2. Сделать скриншот или запись подтверждения пополнения",
					"3. Нажать кнопку ниже и отправить доказательство в созданную ветку",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: "> Когда доказательство оплаты готово, нажмите кнопку ниже.",
			},
			{
				type: V2.ActionRow,
				components: [
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: PROMO_BUTTON_LABEL,
						custom_id: CUSTOM_IDS.FAMILY_PROMO_REQUEST,
					},
				],
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: "**Какие авто вас ждут**\nУдивляйтесь ниже",
			},
			{
				type: V2.MediaGallery,
				items: PROMO_IMAGE_NAMES.map((name) => ({
					media: { url: `attachment://${name}` },
				})),
			},
		],
	};
}

function buildMediaPanel() {
	return {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content: "## Медиа Londo",
			},
			{
				type: V2.TextDisplay,
				content: "Хочешь снимать контент про Londo и развивать медиа-направление семьи? Подай заявку ниже.",
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"**В заявке нужно будет рассказать:**",
					"1. Немного о себе",
					"2. Ссылки на YouTube / Twitch / TikTok",
					"3. Количество подписчиков и средние просмотры",
					"4. Какой контент хочешь делать для семьи",
				].join("\n"),
			},
			{
				type: V2.ActionRow,
				components: [
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: MEDIA_BUTTON_LABEL,
						custom_id: CUSTOM_IDS.FAMILY_MEDIA_REQUEST,
					},
				],
			},
		],
	};
}

async function getPromoChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_PROMO).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel as TextChannel;
}

async function getMediaChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_MEDIA).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel as TextChannel;
}

async function fetchStoredMessage(channel: TextChannel, type: string) {
	const stored = await prisma.botMessage.findUnique({ where: { type } });
	if (!stored) return null;

	const existingChannel = await channel.client.channels.fetch(stored.channelId).catch(() => null);
	if (!existingChannel || existingChannel.type !== ChannelType.GuildText) return null;

	return (existingChannel as TextChannel).messages.fetch(stored.messageId).catch(() => null);
}

export async function upsertFamilyPromoPanel(client: Client, forceRepost = false) {
	const channel = await getPromoChannel(client);
	if (!channel) {
		return { ok: false as const, reason: "channel_not_found" as const };
	}

	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildPromoPanel()],
		files: PROMO_IMAGE_PATHS.map((filePath, index) => new AttachmentBuilder(filePath, { name: PROMO_IMAGE_NAMES[index] })),
	};
	const payloadEdit: any = {
		components: [buildPromoPanel()],
	};

	let message = await fetchStoredMessage(channel, TYPE);
	if (forceRepost && message) {
		await message.delete().catch(() => {});
		message = null;
	}

	if (message) {
		await message.edit(payloadEdit).catch(() => {});
		return { ok: true as const, mode: "edited" as const, messageId: message.id };
	}

	const sent = await channel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: TYPE },
		update: { channelId: sent.channel.id, messageId: sent.id },
		create: { type: TYPE, channelId: sent.channel.id, messageId: sent.id },
	});

	return { ok: true as const, mode: "created" as const, messageId: sent.id };
}

export async function upsertFamilyMediaPanel(client: Client, forceRepost = false) {
	const channel = await getMediaChannel(client);
	if (!channel) {
		return { ok: false as const, reason: "channel_not_found" as const };
	}

	const payload: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildMediaPanel()],
	};

	let message = await fetchStoredMessage(channel, MEDIA_TYPE);
	if (forceRepost && message) {
		await message.delete().catch(() => {});
		message = null;
	}

	if (message) {
		await message.edit(payload).catch(() => {});
		return { ok: true as const, mode: "edited" as const, messageId: message.id };
	}

	const sent = await channel.send(payload);
	await prisma.botMessage.upsert({
		where: { type: MEDIA_TYPE },
		update: { channelId: sent.channel.id, messageId: sent.id },
		create: { type: MEDIA_TYPE, channelId: sent.channel.id, messageId: sent.id },
	});

	return { ok: true as const, mode: "created" as const, messageId: sent.id };
}
