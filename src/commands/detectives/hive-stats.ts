import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel } from "discord.js";
import { updateHiveStats } from "../../services/updateHiveStats";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { DB_STAFF_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";

export const hiveStatsCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DB_HIVE_STATS)
		.setDescription("Пересоздать статистику улик"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, DB_STAFF_ROLE_IDS))) return;

		const channel = interaction.channel as TextChannel;
		if (!channel || !channel.isTextBased())
			return interaction.editReply("❌ Канал не поддерживается.");

		await updateHiveStats(interaction.client, channel, true);

		return interaction.editReply("✅ Статистика обновлена.");
	}
};