import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { applicationButton } from "../../utils/applicationButton";
import { CUSTOM_COMMAND, CUSTOM_IDS } from "../../constants/customIds";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";

export const familyCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FAMILY_APPLICATION)
		.setDescription("Отправить заявку на вступление в семью"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		await applicationButton(
			interaction,
			CUSTOM_IDS.OPEN_FAMILY_APPLICATION,
			"Подать заявку",
			"./assets/logo2.png"
		);
	}
};