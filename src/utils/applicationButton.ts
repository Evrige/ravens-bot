import {
	ChatInputCommandInteraction,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	TextChannel,
	NewsChannel,
	ThreadChannel,
	DMChannel,
	EmbedBuilder,
	AttachmentBuilder
} from "discord.js";

type TextSendable = TextChannel | NewsChannel | ThreadChannel | DMChannel;

export async function applicationButton(
	interaction: ChatInputCommandInteraction,
	buttonId: string,
	buttonLabel: string,
	image: string
) {
	const button = new ButtonBuilder()
		.setCustomId(buttonId)
		.setLabel(buttonLabel)
		.setStyle(ButtonStyle.Secondary); // ← СЕРАЯ кнопка

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

	const channel = interaction.channel;

	const file = new AttachmentBuilder(image, { name: "logo.png" });

	const embed = new EmbedBuilder()
		.setColor("#2b2d31") // цвет как у дискорда (тёмный)
		.setDescription(
			`👋 **ПУТЬ В СЕМЬЮ НАЧИНАЕТСЯ ЗДЕСЬ!**\n\n` +
			`📋 Обычно заявки обрабатываются в течение **1–3 дней** —\n` +
			`всё зависит от загрузки рекрутеров.`
		)
		.setImage("attachment://logo.png");

	if (
		channel instanceof TextChannel ||
		channel instanceof NewsChannel ||
		channel instanceof ThreadChannel ||
		channel instanceof DMChannel
	) {
		await (channel as TextSendable).send({
			embeds: [embed],
			files: [file],
			components: [row]
		});
	}

	if (!interaction.deferred && !interaction.replied) {
		await interaction.deferReply({ ephemeral: true });
	}
	await interaction.deleteReply().catch(() => {});
}