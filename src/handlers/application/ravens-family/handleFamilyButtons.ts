import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	GuildMember,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from "discord.js";
import {createButton} from "../../../components/createButton";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {openFamilyApplicationModal} from "./openFamilyApplicationModal";
import {processFamilyApplication} from "./processFamilyApplication";

export function buildFamilyButtons(userId: string) {
	return new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY}${userId}`,
				label: "Принять",
				style: ButtonStyle.Success}),

			createButton({
				customId: `${CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY}${userId}`,
				label: "Отклонить",
				style: ButtonStyle.Danger}),

			createButton({
				customId: `${CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY}${userId}`,
				label: "Вызвать на обзвон",
				style: ButtonStyle.Primary}),

			createButton({
				customId: `${CUSTOM_IDS.FAMILY_CHAT_APPLICATION_IN_FAMILY}${userId}`,
				label: "Начать чат",
				style: ButtonStyle.Primary}),
		);
}

export async function handleFamilyButtons(interaction: any){
	// Открыть форму
	if (interaction.customId === CUSTOM_IDS.OPEN_FAMILY_APPLICATION) {
		return openFamilyApplicationModal(interaction);
	}

	// Принять
	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY)) {
		const userId = interaction.customId.replace(CUSTOM_IDS.ACCEPT, "");
		return processFamilyApplication(interaction, userId, true);
	}

	// Отклонить
	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY)) {
		const userId = interaction.customId.replace(CUSTOM_IDS.DECLINE, "");

		const modal = new ModalBuilder()
			.setCustomId(`${CUSTOM_IDS.DECLINE_REASON}${userId}`)
			.setTitle("Причина отклонения");

		const reasonInput = new TextInputBuilder()
			.setCustomId(CUSTOM_IDS.REASON)
			.setLabel("Причина")
			.setStyle(TextInputStyle.Paragraph);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
		);

		return interaction.showModal(modal);
	}
}