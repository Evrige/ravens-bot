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
const LOGO_FILE_PATH = "C:\\Users\\artur\\WebstormProjects\\ravens-bot\\assets\\londo.png";

function channelRef(channelId: string) {
	return `<#${channelId}>`;
}

function channelLine(channelId: string, description: string) {
	return `• ${channelRef(channelId)} — ${description}`;
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
					description: "Навигация по серверу",
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
				description: "Londo logo",
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
				channelLine(params.resultChannelId, "Просмотр результата заявок."),
				channelLine(params.guestVoiceChannelId, "Гостевой voice."),
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: "## Полезные ссылки",
		},
	);

	const linkSections = [
		{
			text: `👋 Ждём тебя в нашем дружной фаме **${SERVER_NAME}**`,
			label: "Подать заявку",
			url: params.applyUrl,
		},
		{
			text: "💮 Ссылка на регистрацию /PROMO SENTICEE",
			label: "Регистрация",
			url: params.registerUrl,
		},
		{
			text: "🖋 Telegram канал ownera - SENTICEE.",
			label: "Telegram",
			url: params.telegramUrl,
		},
	];

	for (const item of linkSections) {
		components.push({
			type: V2.Section,
			components: [
				{
					type: V2.TextDisplay,
					content: item.text,
				},
			],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Link,
				label: item.label,
				url: item.url,
			},
		});
	}

	components.push({
		type: V2.TextDisplay,
		content: "-# LONDO BOT",
	});

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
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const channel = interaction.channel;
		if (!channel || !channel.isTextBased()) {
			return interaction.editReply("❌ Эта команда доступна только в текстовом канале.");
		}

		const fallbackChannelId = TEMP_CHANNEL_ID;
		const bannerUrl = interaction.options.getString("banner_url");
		const registerUrl = interaction.options.getString("register_url", true);
		const telegramUrl = interaction.options.getString("telegram_url", true);

		const navigationChannelId = interaction.options.getChannel("navigation_channel")?.id ?? fallbackChannelId;
		const mediaChannelId = interaction.options.getChannel("media_channel")?.id ?? fallbackChannelId;
		const newsChannelId = interaction.options.getChannel("news_channel")?.id ?? fallbackChannelId;
		const guestChatChannelId = interaction.options.getChannel("guest_chat_channel")?.id ?? fallbackChannelId;
		const familyApplyChannelId = interaction.options.getChannel("family_apply_channel")?.id ?? fallbackChannelId;
		const resultChannelId = interaction.options.getChannel("result_channel")?.id ?? fallbackChannelId;
		const guestVoiceChannelId = interaction.options.getChannel("guest_voice_channel")?.id ?? fallbackChannelId;
		const applyUrl =
			interaction.options.getString("apply_url") ??
			`https://discord.com/channels/${interaction.guildId}/${familyApplyChannelId}`;

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
			files: [new AttachmentBuilder(LOGO_FILE_PATH, { name: LOGO_FILE_NAME })],
		});

		return interaction.editReply("✅ Навигационное сообщение отправлено в канал.");
	},
};
