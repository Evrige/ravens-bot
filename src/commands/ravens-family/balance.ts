import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";

export const balanceCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BALANCE)
		.setDescription("Количество монет у пользователя"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// ✅ Отложенный ответ
			await interaction.deferReply({ ephemeral: true });

			const user = await prisma.user.findUnique({
				where: { id: interaction.user.id }
			});

			if (!user) {
				await interaction.editReply("Пользователь не найден в базе.");
				return;
			}

			// Преобразуем Decimal или BigInt
			let balance: number;
			if (user.balance instanceof Object && "toNumber" in user.balance) {
				balance = user.balance.toNumber();
			} else {
				balance = Number(user.balance) / 10; // если хранишь десятые единицы
			}

			await interaction.editReply(`💰 Ваш баланс: ${balance.toFixed(1)} монет`);

		} catch (err) {
			console.error("Ошибка balance:", err);

			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Ошибка при получении баланса", ephemeral: true });
			} else {
				await interaction.editReply("Ошибка при получении баланса");
			}
		}
	}
};