import {ButtonStyle, EmbedBuilder} from "discord.js";
import {CUSTOM_IDS} from "../constants/customIds";

const V2 = {
	ActionRow: 1,
	Button: 2,
	Section: 9,
	TextDisplay: 10,
	Thumbnail: 11,
	Separator: 14,
	Container: 17,
} as const;

function cleanValue(value: string) {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "-";
}

function asQuote(value: string) {
	return `> ${cleanValue(value)}`;
}

function trimText(value: string, max = 1800) {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 20)}\n... [обрезано]`;
}

function button(customId: string, label: string, style: ButtonStyle) {
	return {
		type: V2.Button,
		custom_id: customId,
		label,
		style,
	};
}

function buildFamilyButtonRowsV2(applicationId: bigint, showCallButton = true) {
	const primaryButtons: any[] = [
		button(
			`${CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
			"✅ Принять",
			ButtonStyle.Success
		),
	];

	if (showCallButton) {
		primaryButtons.push(
			button(
				`${CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
				"📞 Вызвать на обзвон",
				ButtonStyle.Primary
			)
		);
	}

	return [
		{
			type: V2.ActionRow,
			components: primaryButtons,
		},
		{
			type: V2.ActionRow,
			components: [
				button(
					`${CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
					"❌ Отклонить",
					ButtonStyle.Danger
				),
			],
		},
	];
}

export function buildFamilyApplicationComponents(params: {
	applicationId: bigint;
	userId: string;
	username?: string | null;
	name: string;
	age: number | string;
	target: string;
	howToKnow: string;
	link: string;
	createdAt: Date;
	avatarUrl?: string | null;
	historyText?: string | null;
	roleMentionText?: string | null;
	callTakenById?: string | null;
	showCallButton?: boolean;
}) {
	const submittedAt = Math.floor(params.createdAt.getTime() / 1000);
	const username = params.username || params.userId;
	const statusLines = ["📋 На рассмотрении"];

	if (params.callTakenById) {
		statusLines.push(`📞 На обзвоне у <@${params.callTakenById}>`);
	}

	const headerSection: any = {
		type: V2.Section,
		components: [
			{
				type: V2.TextDisplay,
				content: [
					"## 📋 Заявка в семью Londo",
					`👤 **Кандидат:** <@${params.userId}> (\`${username}\`)`,
					`📅 **Подана:** <t:${submittedAt}:f>`,
				].join("\n"),
			},
		],
	};

	if (params.avatarUrl) {
		headerSection.accessory = {
			type: V2.Thumbnail,
			media: { url: params.avatarUrl },
		};
	}

	const components: any[] = [
		headerSection,
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: [
				"### 👤 Игровой никнейм | Статик",
				asQuote(String(params.name)),
				"",
				"### 🎂 Возраст (OOC)",
				asQuote(String(params.age)),
				"",
				"### 📣 Как узнали о семье",
				asQuote(params.howToKnow),
				"",
				"### 🎯 Цель вступления в семью",
				asQuote(params.target),
				"",
				"### 🖼️ Скрин персонажей",
				asQuote(params.link),
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: ["## ⚡ Статус", statusLines.join("\n")].join("\n"),
		},
		...buildFamilyButtonRowsV2(params.applicationId, params.showCallButton ?? true),
	];

	if (params.historyText) {
		components.push(
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `### История заявок пользователя\n${trimText(params.historyText)}`,
			}
		);
	}

	if (params.roleMentionText) {
		components.unshift({
			type: V2.TextDisplay,
			content: params.roleMentionText,
		});
	}

	return [
		{
			type: V2.Container,
			components,
		},
	];
}

export function buildFamilyEmbedFromModal(interaction: any) {
	const name = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_NAME);
	const age = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_AGE);
	const target = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_TARGET);
	const howToKnow = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW);
	const link = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_LINK);
	const submittedAt = Math.floor(Date.now() / 1000);
	const username = interaction.user?.username ?? interaction.user?.tag ?? interaction.user?.id ?? "-";
	const avatarUrl = interaction.user?.displayAvatarURL?.({ size: 128 }) ?? null;

	const embed = new EmbedBuilder()
		.setTitle("📋 Заявка в семью Londo")
		.setColor(0x3b3d46)
		.setDescription([
			`👤 **Кандидат:** <@${interaction.user.id}> (\`${username}\`)`,
			`📅 **Подана:** <t:${submittedAt}:f>`,
		].join("\n"))
		.addFields(
			{ name: "👤 Игровой никнейм | Статик", value: asQuote(name), inline: false },
			{ name: "🎂 Возраст (OOC)", value: asQuote(age), inline: false },
			{ name: "📣 Как узнали о семье", value: asQuote(howToKnow), inline: false },
			{ name: "🎯 Цель вступления в семью", value: asQuote(target), inline: false },
			{ name: "🖼️ Скрин персонажей", value: asQuote(link), inline: false },
			{ name: "⚡ Статус", value: "📋 На рассмотрении", inline: false },
		)
		.setFooter({ text: "Londo Family" });

	if (avatarUrl) {
		embed.setThumbnail(avatarUrl);
	}

	return embed;
}

export function buildFamilyEmbedFromApplication(params: {
	userId: string;
	username?: string | null;
	name: string;
	age: number;
	target: string;
	howToKnow: string;
	link: string;
	createdAt: Date;
	callTakenById?: string | null;
	avatarUrl?: string | null;
}) {
	const submittedAt = Math.floor(params.createdAt.getTime() / 1000);
	const username = params.username || params.userId;

	const statusLines = ["📋 На рассмотрении"];
	if (params.callTakenById) {
		statusLines.push(`📞 На обзвоне у <@${params.callTakenById}>`);
	}

	const embed = new EmbedBuilder()
		.setTitle("📋 Заявка в семью Londo")
		.setColor(0x3b3d46)
		.setDescription([
			`👤 **Кандидат:** <@${params.userId}> (\`${username}\`)`,
			`📅 **Подана:** <t:${submittedAt}:f>`,
		].join("\n"))
		.addFields(
			{ name: "👤 Игровой никнейм | Статик", value: asQuote(params.name), inline: false },
			{ name: "🎂 Возраст (OOC)", value: asQuote(String(params.age)), inline: false },
			{ name: "📣 Как узнали о семье", value: asQuote(params.howToKnow), inline: false },
			{ name: "🎯 Цель вступления в семью", value: asQuote(params.target), inline: false },
			{ name: "🖼️ Скрин персонажей", value: asQuote(params.link), inline: false },
			{ name: "⚡ Статус", value: statusLines.join("\n"), inline: false },
		)
		.setFooter({ text: "Londo Family" });

	if (params.avatarUrl) {
		embed.setThumbnail(params.avatarUrl);
	}

	return embed;
}
