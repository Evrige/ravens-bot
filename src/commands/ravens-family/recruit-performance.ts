import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { config } from "../../config/env";
import {
	buildRecruitPerformanceStats,
	getActiveRecruitMembers,
} from "../../services/recruitPerformance";

function formatPercent(value: number) {
	return `${value.toFixed(1)}%`;
}

export const recruitPerformanceCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RECRUIT_PERFORMANCE)
		.setDescription("Подробная эффективность рекрутов")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("Конкретный рекрут для детальной статистики")
				.setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const guild =
				interaction.guild ??
				(await interaction.client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null));

			if (!guild) {
				await interaction.editReply("❌ Не удалось получить сервер для подсчёта статистики.");
				return;
			}

			const requestedUser = interaction.options.getUser("user", false);
			const { members, applications } = await getActiveRecruitMembers(guild);
			const stats = buildRecruitPerformanceStats(
				members.map((member) => member.id),
				applications
			);

			if (requestedUser) {
				const row = stats.find((entry) => entry.recruitId === requestedUser.id);
				const member = members.find((entry) => entry.id === requestedUser.id);

				if (!row || !member) {
					await interaction.editReply(
						"❌ Этот пользователь не найден среди текущих рекрутов с нужными ролями."
					);
					return;
				}

				const embed = new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle(`Эффективность рекрута: ${member.displayName}`)
					.setThumbnail(member.displayAvatarURL())
					.addFields(
						{
							name: "Общая статистика",
							value: [
								`Взято на обзвон: ${row.callTaken}`,
								`Рассмотрено: ${row.total}`,
								`Принято: ${row.accepted}`,
								`Отклонено: ${row.declined}`,
								`Ожидают решения: ${row.pending}`,
								`Конверсия: ${formatPercent(row.conversion)}`,
							].join("\n"),
							inline: false,
						},
						{
							name: "За последнюю неделю",
							value: [
								`Взято на обзвон: ${row.callTakenWeek}`,
								`Рассмотрено: ${row.totalWeek}`,
								`Принято: ${row.acceptedWeek}`,
								`Отклонено: ${row.declinedWeek}`,
								`Ожидают решения: ${row.pendingWeek}`,
								`Конверсия: ${formatPercent(row.conversionWeek)}`,
							].join("\n"),
							inline: false,
						}
					)
					.setFooter({ text: "Видно только вам • by Evri" })
					.setTimestamp();

				await interaction.editReply({ embeds: [embed] });
				return;
			}

			const ordered = [...stats].sort((a, b) => {
				if (b.acceptedWeek !== a.acceptedWeek) return b.acceptedWeek - a.acceptedWeek;
				if (b.accepted !== a.accepted) return b.accepted - a.accepted;
				return b.callTakenWeek - a.callTakenWeek;
			});

			const weeklyLines = ordered.length
				? ordered
						.map((row, index) => {
							const member = members.find((entry) => entry.id === row.recruitId);
							if (!member) return null;

							return `**${index + 1}.** <@${row.recruitId}> — Принято: ${row.acceptedWeek} | Отклонено: ${row.declinedWeek} | Обзвоны: ${row.callTakenWeek} | Конверсия: ${formatPercent(row.conversionWeek)}`;
						})
						.filter((line): line is string => Boolean(line))
						.join("\n")
				: "Нет текущих рекрутов с нужными ролями.";

			const overallLines = ordered.length
				? ordered
						.map((row, index) => {
							const member = members.find((entry) => entry.id === row.recruitId);
							if (!member) return null;

							return `**${index + 1}.** <@${row.recruitId}> — Принято: ${row.accepted} | Отклонено: ${row.declined} | Обзвоны: ${row.callTaken} | Конверсия: ${formatPercent(row.conversion)}`;
						})
						.filter((line): line is string => Boolean(line))
						.join("\n")
				: "Нет текущих рекрутов с нужными ролями.";

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle("Эффективность рекрутов")
				.addFields(
					{
						name: "Топ за последнюю неделю",
						value: weeklyLines,
						inline: false,
					},
					{
						name: "Общая статистика",
						value: overallLines,
						inline: false,
					}
				)
				.setFooter({ text: "Можно выбрать пользователя для детальной статистики • by Evri" })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error("Ошибка recruit-performance:", error);
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply("❌ Ошибка при получении эффективности рекрутов.").catch(() => {});
				return;
			}
			await interaction.reply({
				content: "❌ Ошибка при получении эффективности рекрутов.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
		}
	},
};
