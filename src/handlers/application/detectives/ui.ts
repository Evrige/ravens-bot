import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import {CUSTOM_IDS} from "../../../constants/customIds";


export function buildHivePanelEmbed() {
	return new EmbedBuilder()
		.setTitle("🧾 Подача улики")
		.setDescription(
			"Нажми кнопку ниже, выбери сторону/организацию и тип улики, затем заполни форму.\n" +
			"После отправки создастся личный канал заявки."
		);
}

export function buildHivePanelComponents() {
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(CUSTOM_IDS.OPEN_APPLICATION)
				.setLabel("Подать улику")
				.setStyle(ButtonStyle.Primary)
		),
	];
}