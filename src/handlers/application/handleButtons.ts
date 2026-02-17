import {ActionRowBuilder, ButtonBuilder, ButtonStyle} from "discord.js";
import {createButton} from "../../components/createButton";
import {CUSTOM_IDS} from "../../constants/customIds";

export function buildButtons(userId: string) {
	return new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.ACCEPT}${userId}`,
				label: "Принять",
				style: ButtonStyle.Success}),

			createButton({
				customId: `${CUSTOM_IDS.DECLINE}${userId}`,
				label: "Отклонить",
				style: ButtonStyle.Danger}),

			createButton({
				customId: `${CUSTOM_IDS.CHANGE}${userId}`,
				label: "✏️ Редактировать",
				style: ButtonStyle.Primary}),
		);
}