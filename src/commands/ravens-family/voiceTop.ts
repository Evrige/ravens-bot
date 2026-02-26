import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {formatTime} from "../../utils/time";

export const voiceTopCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.VOICETOP)
		.setDescription("Топ пользователей по времени в войсе"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// Отправляем отложенный ephemeral ответ
			await interaction.deferReply({ ephemeral: true });

			// Берём топ 20 пользователей, только с timeInVoice > 0
			const topUsers = await prisma.user.findMany({
				where: { timeInVoice: { gt: 0n } },
				orderBy: { timeInVoice: "desc" },
				take: 20
			});

			if (!topUsers.length) {
				await interaction.editReply("Нет пользователей с временем в войсе.");
				return;
			}

			const medals = ["🥇", "🥈", "🥉"];

			const description = topUsers.map((u, i) => {
				const medal = medals[i] || `${i + 1}.`;
				return `${medal} <@${u.id}> — ${formatTime(u.timeInVoice)}`;
			}).join("\n");

			const embed = new EmbedBuilder()
				.setTitle("🎙 Топ по времени в голосовых каналах")
				.setDescription(description)
				.setColor(0x00ffff)
				.setFooter({ text: `Обновлено` })
				.setTimestamp();

			// Отправка только автору команды
			await interaction.editReply({ embeds: [embed] });

		} catch (err) {
			console.error("Ошибка voiceTop:", err);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Ошибка при получении топа по войсу", ephemeral: true });
			} else {
				await interaction.editReply("Ошибка при получении топа по войсу");
			}
		}
	}
};