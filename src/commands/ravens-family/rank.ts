import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import {
	createRankHistoryEntry,
	listRankHistoryByUser,
} from "../../services/familyHistoryStore";
import {
	applyFamilyRankChange,
	FAMILY_RANK_CHOICES,
	FamilyRankKey,
	getFamilyRankLabel,
} from "../../services/familyRanks";
import { formatDateTime, truncateText } from "../../utils/formatters";

const RANK_ALLOWED_ROLE_IDS = Array.from(
	new Set([...FAMILY_HIGH_ROLE_IDS, ...FAMILY_OWNERS_ROLE_IDS])
);

function buildRankHistoryEmbeds(
	userId: string,
	username: string,
	rows: Awaited<ReturnType<typeof listRankHistoryByUser>>
) {
	if (!rows.length) {
		return [
			new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle(`История рангов: ${username}`)
				.setDescription("История рангов пока пуста."),
		];
	}

	const chunks: typeof rows[] = [];
	for (let index = 0; index < rows.length; index += 10) {
		chunks.push(rows.slice(index, index + 10));
	}

	return chunks.map((chunk, chunkIndex) => {
		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(
				chunkIndex === 0
					? `История рангов: ${username}`
					: `История рангов: ${username} • стр. ${chunkIndex + 1}`
			);

		for (const row of chunk) {
			embed.addFields({
				name: `${row.action === "PROMOTE" ? "Повышение" : "Понижение"} • ${row.rankLabel} • ${formatDateTime(row.createdAt)}`,
				value: [
					`Модератор: <@${row.moderatorId}>`,
					`До: ${row.beforeRanks || "Нет данных"}`,
					`После: ${row.afterRanks || "Нет данных"}`,
					`Причина: ${truncateText(row.reason || "Не указана", 300)}`,
					`Источник: ${row.source}`,
				].join("\n"),
				inline: false,
			});
		}

		return embed;
	});
}

export const rankCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RANK)
		.setDescription("Ручное управление рангами и история рангов")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("повышение")
				.setDescription("Повысить или выдать ранг пользователю")
				.addUserOption((option) =>
					option.setName("user").setDescription("Пользователь").setRequired(true)
				)
				.addStringOption((option) => {
					option.setName("rank").setDescription("Целевой ранг").setRequired(true);
					for (const choice of FAMILY_RANK_CHOICES) {
						option.addChoices({ name: choice.name, value: choice.value });
					}
					return option;
				})
				.addStringOption((option) =>
					option
						.setName("reason")
						.setDescription("Причина повышения или выдачи")
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("понижение")
				.setDescription("Понизить или снять ранг пользователю")
				.addUserOption((option) =>
					option.setName("user").setDescription("Пользователь").setRequired(true)
				)
				.addStringOption((option) => {
					option.setName("rank").setDescription("Целевой ранг").setRequired(true);
					for (const choice of FAMILY_RANK_CHOICES) {
						option.addChoices({ name: choice.name, value: choice.value });
					}
					return option;
				})
				.addStringOption((option) =>
					option
						.setName("reason")
						.setDescription("Причина понижения или снятия")
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("history")
				.setDescription("Показать историю рангов пользователя")
				.addUserOption((option) =>
					option.setName("user").setDescription("Пользователь").setRequired(true)
				)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!(await checkRolesOrReply(interaction, RANK_ALLOWED_ROLE_IDS))) return;

		const subcommand = interaction.options.getSubcommand();
		const targetUser = interaction.options.getUser("user", true);

		if (subcommand === "history") {
			const rows = await listRankHistoryByUser(targetUser.id, 50);
			const embeds = buildRankHistoryEmbeds(targetUser.id, targetUser.username, rows);

			await interaction.editReply({ embeds });
			return;
		}

		const rankKey = interaction.options.getString("rank", true) as FamilyRankKey;
		const reason = interaction.options.getString("reason", true).trim();
		const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

		if (!member) {
			await interaction.editReply("❌ Пользователь не найден на сервере.");
			return;
		}

		const action = subcommand === "повышение" ? "PROMOTE" : "DEMOTE";
		const result = await applyFamilyRankChange(member, rankKey, action);

		if (!result) {
			await interaction.editReply("❌ Для выбранного ранга не найдена роль на сервере.");
			return;
		}

		if (!result.changed) {
			await interaction.editReply(
				`ℹ️ У пользователя уже актуальное состояние для ранга **${getFamilyRankLabel(rankKey)}**.`
			);
			return;
		}

		const historyEntry = await createRankHistoryEntry({
			userId: member.id,
			action,
			rankKey: result.rankKey,
			rankLabel: result.rankLabel,
			targetRoleId: result.targetRoleId,
			targetRoleName: result.targetRoleName,
			beforeRanks: result.beforeRanks.join(", "),
			afterRanks: result.afterRanks.join(", "),
			reason,
			moderatorId: interaction.user.id,
			source: "MANUAL_COMMAND",
			applicantUsername: targetUser.username,
			applicantDisplayName: member.displayName,
		});

		if (!historyEntry) {
			await interaction.editReply(
				"⚠️ История рангов в БД пока недоступна. Примени миграцию Prisma и попробуй снова."
			);
			return;
		}

		await targetUser.send(
			`${action === "PROMOTE" ? "✅" : "⚠️"} Ваш ранг был ${
				action === "PROMOTE" ? "обновлён" : "изменён"
			}.\nНовый целевой ранг: **${result.rankLabel}**.\nПричина: ${reason}`
		).catch(() => {});

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(action === "PROMOTE" ? 0x57f287 : 0xed4245)
					.setTitle(action === "PROMOTE" ? "Ранг повышен" : "Ранг понижен")
					.setDescription(
						[
							`Пользователь: <@${member.id}>`,
							`Целевой ранг: **${result.rankLabel}**`,
							`До: ${result.beforeRanks.join(", ") || "Нет"}`,
							`После: ${result.afterRanks.join(", ") || "Нет"}`,
							`Причина: ${reason}`,
						].join("\n")
					),
			],
		});
	},
};
