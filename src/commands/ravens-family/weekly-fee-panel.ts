import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel } from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { updateWeeklyFeePanel } from "../../services/updateWeeklyFeePanel";
import {CUSTOM_COMMAND} from "../../constants/customIds";

export const weeklyFeePanelCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FEE_PANEL)
		.setDescription("Создать/пересоздать панель недельного взноса"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const ch = interaction.channel;
		if (!ch || !ch.isTextBased()) return interaction.editReply("❌ Канал не поддерживается.");

		await updateWeeklyFeePanel(interaction.client, ch as TextChannel, true);
		return interaction.editReply("✅ Панель взноса создана/пересоздана.");
	}
};