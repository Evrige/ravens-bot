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
			CUSTOM_IDS.OPEN_FAMILY_APPLICATION,       // уникальный ID кнопки
			"ПОДАТЬ ЗАЯВКУ",                // текст на кнопке
			"https://tv.ua/i/88/99/36/889936/178652c70311608a54bbb99b45a7e10b-quality_70Xresize_crop_1Xallow_enlarge_0Xw_750Xh_463.jpg" // картинка для сообщения
		);
	}
};