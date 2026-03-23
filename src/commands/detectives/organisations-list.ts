import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel } from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { DB_STAFF_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { updateOrganisationsPanel } from "../../services/updateOrganisationsPanel";

export const organisationsListCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DB_ORGANISATIONS_LIST)
		.setDescription("Пересоздать список организаций"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, DB_STAFF_ROLE_IDS))) return;

		const channel = interaction.channel as TextChannel;
		if (!channel || !channel.isTextBased()) {
			return interaction.editReply("❌ Канал не поддерживается.");
		}

		await updateOrganisationsPanel(interaction.client, channel, true);

		return interaction.editReply("✅ Список организаций обновлён.");
	},
};