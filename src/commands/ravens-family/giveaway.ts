import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { upsertGiveawayPanel } from "../../services/upsertGiveawayPanel";

export const giveawayCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.GIVEAWAY)
		.setDescription("Пересоздать панель управления розыгрышами"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		await upsertGiveawayPanel(interaction.client, true);
		return interaction.editReply("✅ Панель розыгрышей обновлена.");
	},
};
