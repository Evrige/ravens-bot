import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { updateMarket } from "../../services/updateMarket";
import { upsertMarketAdminPanel } from "../../services/upsertMarketAdminPanel";

export const marketCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET)
		.setDescription("Пересоздать сообщение магазина в канале маркета"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		await updateMarket(interaction.client, undefined, true);
		await upsertMarketAdminPanel(interaction.client, true);
		return interaction.editReply("✅ Панели магазина обновлены в канале маркета.");
	}
};
