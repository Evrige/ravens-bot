import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { createCoinflipChallenge } from "../../handlers/handleCoinflipUI";

export const coinflipCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.COINFLIP)
		.setDescription("Сыграть coinflip на монеты")
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
				content: "❌ Нельзя вызвать бота на coinflip.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return;
		}

		if (targetUser?.id === interaction.user.id) {
			await interaction.reply({
				content: "❌ Нельзя сыграть coinflip с самим собой.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return;
		}

		await createCoinflipChallenge(interaction, amount, targetUser ?? null);
	},
};
