import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { upsertFamilyGamesAdminPanel } from "../../services/upsertFamilyGamesAdminPanel";
import { upsertFamilyGamesPanel } from "../../services/upsertFamilyGamesPanel";

const GAMES_MANAGE_ROLE_IDS = Array.from(new Set([...FAMILY_HIGH_ROLE_IDS, ...FAMILY_OWNERS_ROLE_IDS]));

export const gamesCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.GAMES)
		.setDescription("Пересоздать панели игровых ролей"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, GAMES_MANAGE_ROLE_IDS))) return;

		await upsertFamilyGamesPanel(interaction.client, true);
		await upsertFamilyGamesAdminPanel(interaction.client, true);
		return interaction.editReply("✅ Панели игровых ролей обновлены.");
	},
};
