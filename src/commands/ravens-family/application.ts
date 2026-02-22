import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {applicationButton} from "../../utils/applicationButton";
import {CUSTOM_COMMAND, CUSTOM_IDS} from "../../constants/customIds";

export const familyCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FAMILY_APPLICATION)
		.setDescription("Отправить заявку на вступление в семью"),

	async execute(interaction: ChatInputCommandInteraction) {
		await applicationButton(
			interaction,
			CUSTOM_IDS.OPEN_FAMILY_APPLICATION,
			"ПОДАТЬ ЗАЯВКУ",
			"https://cdn.pixabay.com/photo/2021/12/12/20/00/play-6865967_1280.jpg"
		);
	}
};