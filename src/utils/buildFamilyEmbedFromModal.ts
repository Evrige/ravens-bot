import {EmbedBuilder} from "discord.js";
import {CUSTOM_IDS} from "../constants/customIds";

export function buildFamilyEmbedFromModal(interaction: any) {
	return new EmbedBuilder()
		.setTitle("Заявка в семью")
		.addFields(
			{ name: CUSTOM_IDS.APPLICATION_FAMILY_NAME, value: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_NAME) },
			{ name: CUSTOM_IDS.APPLICATION_FAMILY_AGE, value: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_AGE) },
			{ name: CUSTOM_IDS.APPLICATION_FAMILY_TARGET, value: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_TARGET) },
			{ name: CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW, value: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW) },
			{ name: CUSTOM_IDS.APPLICATION_FAMILY_LINK, value: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_LINK) },
			{ name: "👤 Автор заявки", value: `<@${interaction.user.id}>` }
		)
		.setColor("Blue")
		.setFooter({ text: "by Evri" })
		.setTimestamp();
}