import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";

export const recruitStatsCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RECRUIT_STATS)
		.setDescription("Статистика по принятым заявкам"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// 1️⃣ Получаем все заявки с рекрутами
			const applications = await prisma.application.findMany({
				where: { recruitId: { not: null } },
				select: { recruitId: true, isAccepted: true }
			});

			// 2️⃣ Считаем количество принятых заявок по рекрутерам
			const counts: Record<string, { accepted: number; total: number }> = {};

			applications.forEach(a => {
				if (!a.recruitId) return;
				if (!counts[a.recruitId]) counts[a.recruitId] = { accepted: 0, total: 0 };
				counts[a.recruitId].total += 1;
				if (a.isAccepted) counts[a.recruitId].accepted += 1;
			});

			// 3️⃣ Сортируем по количеству принятых заявок
			const stats = Object.entries(counts)
				.sort((a, b) => b[1].accepted - a[1].accepted)
				.slice(0, 50);

			// 4️⃣ Формируем описание
			const description = stats.length
				? stats.map(
					([id, c]) => `<@${id}> — Принято заявок: ${c.accepted}, Всего: ${c.total}`
				).join("\n")
				: "Пока нет заявок.";

			// 5️⃣ Формируем embed
			const embed = new EmbedBuilder()
				.setTitle("📊 Статистика рекрутеров")
				.setColor("Blue")
				.setDescription(description)
				.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
				.setTimestamp();

			// 6️⃣ Отправляем embed для всех
			await interaction.reply({ embeds: [embed] });
		} catch (err) {
			console.error("Ошибка recruit-stats:", err);
			if (!interaction.replied) {
				await interaction.reply({ content: "Ошибка при получении статистики" });
			}
		}
	},
};