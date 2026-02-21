import {
	ChatInputCommandInteraction,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	TextChannel,
	NewsChannel,
	ThreadChannel,
	DMChannel
} from "discord.js";

// Тип каналов, где точно есть send()
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
		.setStyle(ButtonStyle.Danger);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

	const channel = interaction.channel;

	// Явная проверка типов каналов
	if (
		channel instanceof TextChannel ||
		channel instanceof NewsChannel ||
		channel instanceof ThreadChannel ||
		channel instanceof DMChannel
	) {
		await (channel as TextSendable).send({
			content: " ", // хотя бы пробел
			files: [image],
			components: [row]
		});
	}

	if (!interaction.deferred && !interaction.replied) {
		await interaction.deferReply({ ephemeral: true });
	}
	await interaction.deleteReply().catch(() => {});
}