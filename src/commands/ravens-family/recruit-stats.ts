import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {checkRolesOrReply} from "../../utils/checkRoles";

export const recruitStatsCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RECRUIT_STATS)
		.setDescription("Статистика по принятым заявкам"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			await interaction.deferReply();

			// Проверка ролей
			if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

			const generateEmbed = async () => {
				const applications = await prisma.application.findMany({
					where: { recruitId: { not: null } },
					select: { recruitId: true, isAccepted: true }
				});

				const counts: Record<string, { accepted: number; total: number }> = {};

				applications.forEach(a => {
					if (!a.recruitId) return;
					if (!counts[a.recruitId]) counts[a.recruitId] = { accepted: 0, total: 0 };
					counts[a.recruitId].total += 1;
					if (a.isAccepted) counts[a.recruitId].accepted += 1;
				});

				const stats = Object.entries(counts)
					.sort((a, b) => b[1].accepted - a[1].accepted)
					.slice(0, 50);

				const description = stats.length
					? stats.map(
						([id, c]) => `<@${id}> — Принято заявок: ${c.accepted}, Отклонено: ${c.total - c.accepted}. Всего: ${c.total}`
					).join("\n")
					: "Пока нет заявок.";

				return new EmbedBuilder()
					.setTitle("📊 Статистика рекрутеров")
					.setColor("Blue")
					.setDescription(description)
					.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
					.setTimestamp();
			};

			const embed = await generateEmbed();
			const msg = await interaction.editReply({ embeds: [embed] });

			// 🔥 Сохраняем messageId + channelId в БД
			await prisma.botMessage.upsert({
				where: { type: "recruit_stats" },
				update: { messageId: msg.id, channelId: msg.channelId },
				create: { type: "recruit_stats", messageId: msg.id, channelId: msg.channelId }
			});

			// ❌ Убираем setInterval из команды! — глобальный автообновитель будет отдельно

		} catch (err) {
			console.error("Ошибка recruit-stats:", err);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Ошибка при получении статистики" });
			}
		}
	},
};