import {EmbedBuilder} from "discord.js";

export function buildDbEmbedFromModal(interaction: any) {

	const typeInput = interaction.fields.getTextInputValue("type").trim();
	const typeText = typeInput === "1" ? "Обязательная" : "Не обязательная";

	return new EmbedBuilder()
		.setTitle("Улика")
		.addFields(
			{ name: "Имя в игре", value: interaction.fields.getTextInputValue("game_name") },
			{ name: "Тип улики", value: typeText },
			{ name: "Подробный рассказ", value: interaction.fields.getTextInputValue("story") },
			{ name: "Видео", value: interaction.fields.getTextInputValue("video") },
			{ name: "На кого улика", value: interaction.fields.getTextInputValue("target") }
		)
		.setColor("Blue")
		.setFooter({ text: "by Evri" })
		.setTimestamp();
}