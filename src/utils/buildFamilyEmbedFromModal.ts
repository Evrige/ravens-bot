import {EmbedBuilder} from "discord.js";
import {CUSTOM_IDS} from "../constants/customIds";

function cleanValue(value: string) {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "-";
}

function asQuote(value: string) {
	return `> ${cleanValue(value)}`;
}

function getImageUrl(value: string) {
	const trimmed = value.trim();
	if (!/^https?:\/\//i.test(trimmed)) return null;
	return trimmed;
}

export function buildFamilyEmbedFromModal(interaction: any) {
	const name = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_NAME);
	const age = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_AGE);
	const target = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_TARGET);
	const howToKnow = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW);
	const link = interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_LINK);
	const imageUrl = getImageUrl(link);
	const submittedAt = Math.floor(Date.now() / 1000);
	const username = interaction.user?.username ?? interaction.user?.tag ?? interaction.user?.id ?? "-";

	const embed = new EmbedBuilder()
		.setTitle("📋 Заявка в семью")
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
		.setFooter({ text: "Ravens Family" });

	if (imageUrl) {
		embed.setThumbnail(imageUrl);
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
}) {
	const imageUrl = getImageUrl(params.link);
	const submittedAt = Math.floor(params.createdAt.getTime() / 1000);
	const username = params.username || params.userId;

	const statusLines = ["📋 На рассмотрении"];
	if (params.callTakenById) {
		statusLines.push(`📞 На обзвоне у <@${params.callTakenById}>`);
	}

	const embed = new EmbedBuilder()
		.setTitle("📋 Заявка в семью")
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
		.setFooter({ text: "Ravens Family" });

	if (imageUrl) {
		embed.setThumbnail(imageUrl);
	}

	return embed;
}
