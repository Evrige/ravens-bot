import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {checkRolesOrReply} from "../../utils/checkRoles";
import { config } from "../../config/env";
import { buildRecruitStatsEmbed } from "../../services/recruitStats";

export const recruitStatsCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RECRUIT_STATS)
		.setDescription("Статистика по принятым заявкам"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			await interaction.deferReply();

			// Проверка ролей
			if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

			const guild =
				interaction.guild ??
				(await interaction.client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null));

			if (!guild) {
				await interaction.editReply("❌ Не удалось получить сервер для подсчёта статистики.");
				return;
			}

			const embed = await buildRecruitStatsEmbed(guild);
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
