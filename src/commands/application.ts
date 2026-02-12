import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	EmbedBuilder,
	SlashCommandBuilder,
	REST,
	Routes
} from "discord.js";

export async function registerApplicationCommand(client: Client) {
	const command = new SlashCommandBuilder()
		.setName("заявка")
		.setDescription("Отправить форму заявки");

	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);


	await rest.put(
		Routes.applicationCommands(client.user!.id),
		{ body: [command.toJSON()] }
	);
}

export async function sendApplicationEmbed(interaction: any) {
	const button = new ButtonBuilder()
		.setCustomId("open_application")
		.setLabel("ПОДАТЬ УЛИКУ")
		.setStyle(ButtonStyle.Danger);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

	// Отправляем картинку + кнопку в канал, где вызвана команда
	if (interaction.channel) {
		await interaction.channel.send({
			content: " ", // нужен хотя бы пробел
			files: [
				"https://tv.ua/i/88/99/36/889936/178652c70311608a54bbb99b45a7e10b-quality_70Xresize_crop_1Xallow_enlarge_0Xw_750Xh_463.jpg"
			],
			components: [row]
		});

		// Убираем стандартный ответ на команду, чтобы ничего не показывалось
		if (interaction.deferred || interaction.replied) {
			await interaction.deleteReply().catch(() => {});
		} else {
			await interaction.deferReply({ ephemeral: true });
			await interaction.deleteReply().catch(() => {});
		}
	}
}


