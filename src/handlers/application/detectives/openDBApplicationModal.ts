import {ActionRowBuilder, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle} from "discord.js";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {createInput} from "../../../components/createInput";

export async function openDBApplicationModal(
	interaction: any,
	data?: any,
	messageId?: string
) {
	const member = interaction.member as GuildMember;
	const nickname = member?.nickname || interaction.user.username;

	const getValueByName = (name: string) =>
		data?.find((item: any) => item.name === name)?.value ?? "";


	const modal = new ModalBuilder()
		.setCustomId(
			messageId
				? `${CUSTOM_IDS.MODAL_EDIT}${messageId}`
				: CUSTOM_IDS.MODAL_NEW
		)
		.setTitle(data ? "Редактирование" : "Форма заявки");

	const nameInput = createInput({
		id: CUSTOM_IDS.GAME_NAME,
		label: "Имя в игре",
		placeholder: "Имя в игре",
		style: TextInputStyle.Short,
		defaultValue: getValueByName("Имя в игре") || nickname
	});

	const typeInput = createInput({
		id: CUSTOM_IDS.HIVE_TYPE,
		label: "Тип улики (1 или 0)",
		placeholder: "1 - Обязательная, 0 - Не обязательная",
		style: TextInputStyle.Short,
		defaultValue: getValueByName("Тип улики") === "Обязательная" ? "1" :
			getValueByName("Тип улики") === "Не обязательная" ? "0" : ""
	});

	const storyInput = createInput({
		id: CUSTOM_IDS.STORY,
		label: "Подробный рассказ",
		placeholder: "Подробный рассказ о происходящем",
		style: TextInputStyle.Paragraph,
		defaultValue: getValueByName("Подробный рассказ")
	});

	const videoInput = createInput({
		id: CUSTOM_IDS.VIDEO,
		label: "Ссылка на видео(YouTube/RuTube)",
		placeholder: "Ссылка на видео",
		style: TextInputStyle.Short,
		defaultValue: getValueByName("Видео")
	});

	const targetInput = createInput({
		id: CUSTOM_IDS.TARGET,
		label: "На кого улика",
		placeholder: "Фракция/Семья на кого улика",
		style: TextInputStyle.Short,
		defaultValue: getValueByName("На кого улика")
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