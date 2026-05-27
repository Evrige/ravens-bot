import {ActionRowBuilder, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle} from "discord.js";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {createInput} from "../../../components/createInput";

export async function openFamilyApplicationModal(
	interaction: any,
) {
	const member = interaction.member as GuildMember;


	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_MODAL_NEW)
		.setTitle("Форма заявки");

	const nameInput = createInput({
		id: CUSTOM_IDS.APPLICATION_FAMILY_NAME,
		label: CUSTOM_IDS.APPLICATION_FAMILY_NAME,
		placeholder: "Enquiry | статик",
		style: TextInputStyle.Short
	});

	const typeInput = createInput({
		id: CUSTOM_IDS.APPLICATION_FAMILY_AGE,
		label: CUSTOM_IDS.APPLICATION_FAMILY_AGE,
		placeholder: "20 лет",
		style: TextInputStyle.Short
	});

	const storyInput = createInput({
		id: CUSTOM_IDS.APPLICATION_FAMILY_TARGET,
		label: CUSTOM_IDS.APPLICATION_FAMILY_TARGET,
		placeholder: "Почему хотите именно к нас в семью",
		style: TextInputStyle.Paragraph
	});

	const videoInput = createInput({
		id: CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW,
		label: CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW,
		placeholder: "Расскажите откуда узнали о нас",
		style: TextInputStyle.Short
	});

	const targetInput = createInput({
		id: CUSTOM_IDS.APPLICATION_FAMILY_LINK,
		label: CUSTOM_IDS.APPLICATION_FAMILY_LINK,
		placeholder: "Ссылка на скрин с персонажами(imgur, yapix...)",
		style: TextInputStyle.Short
	});

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(storyInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(videoInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput)
	);

	return interaction.showModal(modal);
}
