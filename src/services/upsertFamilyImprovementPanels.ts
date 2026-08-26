import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	MessageFlags,
	StringSelectMenuBuilder,
	TextChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";
import { CHANNEL_IDS } from "../config/channels";
import {
	FAMILY_HIERARCHY_ENTRIES,
	IMPROVEMENT_REQUESTS,
	ImprovementRequestKey,
} from "../config/familyImprovementSystem";
import { CUSTOM_IDS } from "../constants/customIds";
import path from "path";

const INFO_TYPE = "family_improvement_info_panel";
const REQUEST_TYPE = "family_improvement_request_panel";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Thumbnail: 11,
	Separator: 14,
	Button: 2,
} as const;

const LOGO_FILE_NAME = "londo.png";
const LOGO_FILE_PATH = path.join(process.cwd(), "assets", "londo.png");

function buildInfoPanel() {
	const rankLines = FAMILY_HIERARCHY_ENTRIES.map((entry, index) =>
		[
			`**[${index + 1}] ${entry.title}**`,
			entry.description,
			entry.title === "Londest Londo"
				? `◇ ${entry.conditions}\n◇ Подать заявку на Londest Londo: <#${CHANNEL_IDS.FAMILY_PROMO}>`
				: `◇ ${entry.conditions}`,
		].join("\n")
	).join("\n\n");

	return {
		type: V2.Container,
		components: [
			{
				type: V2.Section,
				components: [
					{
						type: V2.TextDisplay,
						content: "## Londo - Иерархия\nСистема рангов и должностей семьи Londo.",
					},
				],
				accessory: {
					type: V2.Thumbnail,
					media: { url: `attachment://${LOGO_FILE_NAME}` },
					description: "Londo logo",
				},
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"Иерархия состоит из двух частей:",
					"1. **Основные ранги** — путь развития внутри семьи.",
					"2. **Должности** — дополнительные роли по желанию и доверию.",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `### Система рангов\n${rankLines}`,
			},
			{ type: V2.Separator },
			{
				type: V2.Section,
				components: [
					{
						type: V2.TextDisplay,
						content: "Хочешь подать запрос на повышение или роль? Открой канал заявок ниже.",
					},
				],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Link,
					label: "Открыть",
					url: `https://discord.com/channels/${config.FAMILY_SERVER_GUID}/${config.FAMILY_REQUEST_IMPROVMENT_SYSTEM_CHANNEL_ID}`,
				},
			},
		],
	};
}

function buildRequestPanel() {
	return {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content: "## Система повышений Londo",
			},
			{
				type: V2.TextDisplay,
				content: "Выберите нужный пункт в меню ниже и отправьте короткую заявку.",
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"**Что можно запросить:**",
					"• Повышение по основной ветке рангов.",
					"• Получение роли `Recruit`.",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content:
					`Ознакомиться с полной системой можно в канале <#${config.FAMILY_IMPROVMENT_SYSTEM_CHANNEL_ID}>.`,
			},
		],
	};
}

function buildRequestSelect() {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(CUSTOM_IDS.FAMILY_IMPROVEMENT_REQUEST_SELECT)
			.setPlaceholder("Подать заявку на повышение / должность")
			.addOptions(
				(Object.entries(IMPROVEMENT_REQUESTS) as Array<
					[ImprovementRequestKey, (typeof IMPROVEMENT_REQUESTS)[ImprovementRequestKey]]
				>).map(([key, value]) => ({
					label: value.label,
					description: value.description.slice(0, 100),
					value: key,
				}))
			)
	);
}

async function getTextChannel(client: Client, channelId: string) {
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel as TextChannel;
}

async function upsertPanelMessage(options: {
	client: Client;
	type: string;
	channelId: string;
	components: any[];
	files?: AttachmentBuilder[];
}) {
	const channel = await getTextChannel(options.client, options.channelId);
	if (!channel) return { ok: false as const, reason: "channel_not_found" as const };

	const stored = await prisma.botMessage.findUnique({ where: { type: options.type } });
	const sendPayload: any = {
		flags: MessageFlags.IsComponentsV2,
		components: options.components,
		...(options.files?.length ? { files: options.files } : {}),
	};

	if (stored && stored.channelId === channel.id) {
		const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
		if (existing) {
			await existing.edit({
				components: options.components,
			}).catch(() => null);
			return { ok: true as const, mode: "edited" as const };
		}
	}

	const sent = await channel.send(sendPayload);

	await prisma.botMessage.upsert({
		where: { type: options.type },
		update: { channelId: channel.id, messageId: sent.id },
		create: { type: options.type, channelId: channel.id, messageId: sent.id },
	});

	return { ok: true as const, mode: "created" as const };
}

export async function upsertFamilyImprovementPanels(client: Client) {
	const infoPanel = await upsertPanelMessage({
		client,
		type: INFO_TYPE,
		channelId: config.FAMILY_IMPROVMENT_SYSTEM_CHANNEL_ID,
		components: [buildInfoPanel()],
		files: [new AttachmentBuilder(LOGO_FILE_PATH, { name: LOGO_FILE_NAME })],
	});

	const requestPanel = await upsertPanelMessage({
		client,
		type: REQUEST_TYPE,
		channelId: config.FAMILY_REQUEST_IMPROVMENT_SYSTEM_CHANNEL_ID,
		components: [buildRequestPanel(), buildRequestSelect().toJSON()],
	});

	return {
		ok: infoPanel.ok && requestPanel.ok,
		infoPanel,
		requestPanel,
	};
}
