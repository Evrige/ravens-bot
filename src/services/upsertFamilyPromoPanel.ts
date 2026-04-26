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

const V2 = {
	ActionRow: 1,
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Separator: 14,
	Button: 2,
	MediaGallery: 12,
} as const;

const PROMO_REGISTER_URL = "https://majestic-rp.ru/register?utm_campaign=senticee";
const PROMO_EXAMPLE_URL = "https://youtu.be/uf-6T81xxVI";
const PROMO_CODE = "SENTICEE";
const PROMO_BUTTON_LABEL = "👋 Я ввел промокод SENTICEE";

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
					`Вы можете получить доступ к всему автопарку семьи и бонусом **50.000$** с рангом ${LONDEST_ROLE_MENTION}`,
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content:
					"> Этот ранг создан как благодарность для людей, которые поддерживают меня как контент-мейкера, регистрируясь с моим промокодом. Вы также можете повышаться в семье по стандартной системе, но для этого потребуется больше времени и доверия с нашей стороны.",
			},
			{ type: V2.Separator },
			{
				type: V2.Section,
				components: [
					{
						type: V2.TextDisplay,
						content: [
							"**Для получения ранга Londest Londo вам нужно:**",
							`1. Ввести на любом из серверов **Majestic RP** промокод **${PROMO_CODE}** — ${PROMO_REGISTER_URL}`,
							"2. Записать доказательство активации промокода",
							"3. Нажать кнопку ниже 👇",
						].join("\n"),
					},
				],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Link,
					label: "Пример",
					url: PROMO_EXAMPLE_URL,
				},
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: "> Когда запись готова, нажмите кнопку ниже.",
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
				content: "**Какие авто помимо 50.000$, вас ждут**\nУдивляйтесь ниже",
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

async function getPromoChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_PROMO).catch(() => null);
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

	let message = await fetchStoredMessage(channel);
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
