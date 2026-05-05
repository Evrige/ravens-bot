import {
	AttachmentBuilder,
	ButtonStyle,
	ChannelType,
	ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
	TextChannel,
} from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";
import path from "path";

const V2 = {
	Container: 17,
	Section: 9,
	TextDisplay: 10,
	Thumbnail: 11,
	MediaGallery: 12,
	Separator: 14,
	Button: 2,
} as const;

const TEMP_CHANNEL_ID = "1474900345300979835";
const SERVER_NAME = "LONDO";
const LOGO_FILE_NAME = "londo.png";
const LOGO_FILE_PATH = path.join(process.cwd(), "assets", "londo.png");
const PROMO_FILE_NAME = "londo-promo.png";
const PROMO_FILE_PATH = path.join(process.cwd(), "assets", "londo-promo.png");

function channelRef(channelId: string) {
	return `<#${channelId}>`;
}

function channelLine(channelId: string, description: string) {
	return `• ${channelRef(channelId)} — ${description}`;
}

function normalizeUrl(
	value: string | null | undefined,
	guildId: string,
	fallbackChannelId: string
): string | null {
	if (!value) return null;

	const trimmed = value.trim();
	if (!trimmed) return null;

	if (/^\d+$/.test(trimmed)) {
		return `https://discord.com/channels/${guildId}/${trimmed}`;
	}

	if (/^https?:\/\//i.test(trimmed) || /^discord:\/\//i.test(trimmed)) {
		return trimmed;
	}

	return `https://discord.com/channels/${guildId}/${fallbackChannelId}`;
}

function buildLinkSection(text: string, label: string, url: string | null) {
	if (!url) {
		return {
			type: V2.TextDisplay,
			content: text,
		};
	}

	return {
		type: V2.Section,
		components: [
			{
				type: V2.TextDisplay,
				content: text,
			},
		],
		accessory: {
			type: V2.Button,
			style: ButtonStyle.Link,
			label,
			url,
		},
	};
}

function buildNavigationPanel(params: {
	bannerUrl: string | null;
	navigationChannelId: string;
	mediaChannelId: string;
	newsChannelId: string;
	guestChatChannelId: string;
	familyApplyChannelId: string;
	resultChannelId: string;
	guestVoiceChannelId: string;
	applyUrl: string | null;
	registerUrl: string | null;
	telegramUrl: string | null;
}) {
	const components: any[] = [];

	if (params.bannerUrl) {
		components.push({
			type: V2.MediaGallery,
			items: [
				{
					media: { url: params.bannerUrl },
				},
			],
		});
		components.push({ type: V2.Separator });
	}

	components.push(
		{
			type: V2.Section,
			components: [
				{
					type: V2.TextDisplay,
					content: `## Путеводитель по серверу **${SERVER_NAME}**\nБыстрая навигация по основным разделам`,
				},
			],
			accessory: {
				type: V2.Thumbnail,
				media: { url: `attachment://${LOGO_FILE_NAME}` },
			},
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: "## Основные разделы",
		},
		{
			type: V2.TextDisplay,
			content: [
				channelLine(params.navigationChannelId, "Навигация сервера."),
				channelLine(params.mediaChannelId, "Трансляции и видео."),
				channelLine(params.newsChannelId, "Важные новости сервера."),
				channelLine(params.guestChatChannelId, "Общий чат, гостевой."),
				channelLine(params.familyApplyChannelId, "Подать заявку в семью."),
				channelLine(params.guestVoiceChannelId, "Гостевой voice."),
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: "## Полезные ссылки",
		},
		buildLinkSection(
			`👋 Ждём тебя в нашей дружной фаме **${SERVER_NAME}**`,
			"Подать заявку",
			params.applyUrl
		),
		buildLinkSection(
			"<:mc:1496997310956310770> Ссылка на регистрацию **/PROMO LONDO**",
			"Регистрация",
			params.registerUrl
		),
		buildLinkSection(
			"<:telegram:1496991712550064249>  Telegram канал овнера - **SENTICEE.**",
			"Telegram",
			params.telegramUrl
		),
		{
			type: V2.MediaGallery,
			items: [
				{
					media: { url: `attachment://${PROMO_FILE_NAME}` },
				},
			],
		},
		{
			type: V2.TextDisplay,
			content: "-# LONDO BOT",
		}
	);

	return {
		type: V2.Container,
		components,
	};
}

export const navigationPanelCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FAMILY_NAVIGATION)
		.setDescription("Опубликовать навигационное сообщение в текущем канале")
		.addStringOption((option) =>
			option
				.setName("register_url")
				.setDescription("Ссылка для кнопки 'Регистрация'")
				.setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName("telegram_url")
				.setDescription("Ссылка для кнопки 'Telegram'")
				.setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName("banner_url")
				.setDescription("URL баннера/картинки сверху")
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("navigation_channel")
				.setDescription("Канал навигации")
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("media_channel")
				.setDescription("Канал медиа")
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("news_channel")
				.setDescription("Канал новостей")
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("guest_chat_channel")
				.setDescription("Гостевой чат")
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("family_apply_channel")
				.setDescription("Канал заявок в семью")
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("result_channel")
				.setDescription("Канал с итогами заявок")
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addChannelOption((option) =>
			option
				.setName("guest_voice_channel")
				.setDescription("Гостевой голосовой канал")
				.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
				.setRequired(false)
		)
		.addStringOption((option) =>
			option
				.setName("apply_url")
				.setDescription("Ссылка для кнопки 'Подать заявку'")
				.setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const channel = interaction.channel;
		if (!channel || !channel.isTextBased()) {
			return interaction.editReply("❌ Эта команда доступна только в текстовом канале.");
		}

		if (!interaction.guildId) {
			return interaction.editReply("❌ Не удалось определить сервер.");
		}

		const fallbackChannelId = TEMP_CHANNEL_ID;
		const bannerUrl = interaction.options.getString("banner_url");

		const navigationChannelId =
			interaction.options.getChannel("navigation_channel")?.id ?? fallbackChannelId;
		const mediaChannelId =
			interaction.options.getChannel("media_channel")?.id ?? fallbackChannelId;
		const newsChannelId =
			interaction.options.getChannel("news_channel")?.id ?? fallbackChannelId;
		const guestChatChannelId =
			interaction.options.getChannel("guest_chat_channel")?.id ?? fallbackChannelId;
		const familyApplyChannelId =
			interaction.options.getChannel("family_apply_channel")?.id ?? fallbackChannelId;
		const resultChannelId =
			interaction.options.getChannel("result_channel")?.id ?? fallbackChannelId;
		const guestVoiceChannelId =
			interaction.options.getChannel("guest_voice_channel")?.id ?? fallbackChannelId;

		const applyUrl =
			normalizeUrl(
				interaction.options.getString("apply_url"),
				interaction.guildId,
				familyApplyChannelId
			) ??
			`https://discord.com/channels/${interaction.guildId}/${familyApplyChannelId}`;

		const normalizedRegisterUrl = normalizeUrl(
			interaction.options.getString("register_url", true),
			interaction.guildId,
			fallbackChannelId
		);
		const registerUrl = normalizedRegisterUrl
			? normalizedRegisterUrl.replace(/utm_campaign=senticee/gi, "utm_campaign=londo")
			: null;

		const telegramUrl = normalizeUrl(
			interaction.options.getString("telegram_url", true),
			interaction.guildId,
			fallbackChannelId
		);

		const container = buildNavigationPanel({
			bannerUrl,
			navigationChannelId,
			mediaChannelId,
			newsChannelId,
			guestChatChannelId,
			familyApplyChannelId,
			resultChannelId,
			guestVoiceChannelId,
			applyUrl,
			registerUrl,
			telegramUrl,
		});

		await (channel as TextChannel).send({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			files: [
				new AttachmentBuilder(LOGO_FILE_PATH, { name: LOGO_FILE_NAME }),
				new AttachmentBuilder(PROMO_FILE_PATH, { name: PROMO_FILE_NAME }),
			],
		});

		return interaction.editReply("✅ Навигационное сообщение отправлено в канал.");
	},
};
