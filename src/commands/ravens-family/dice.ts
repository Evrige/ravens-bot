import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { createDiceChallenge } from "../../handlers/handleDiceUI";

export const diceCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DICE)
		.setDescription("Сыграть в кости на монеты")
		.addNumberOption((option) =>
			option
				.setName("amount")
				.setDescription("Количество монет")
				.setRequired(true)
				.setMinValue(1)
		)
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("С кем хотите сыграть")
				.setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const amount = interaction.options.getNumber("amount", true);
		const targetUser = interaction.options.getUser("user");

		if (targetUser?.bot) {
			await interaction.reply({
				content: "❌ Нельзя вызвать бота на кости.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return;
		}

		if (targetUser?.id === interaction.user.id) {
			await interaction.reply({
				content: "❌ Нельзя сыграть в кости с самим собой.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return;
		}

		await createDiceChallenge(interaction, amount, targetUser ?? null);
	},
};
