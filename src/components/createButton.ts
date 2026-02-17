import {ButtonBuilder, ButtonStyle} from "discord.js";

export function createButton(options: {
	customId: string;
	label: string;
	style: ButtonStyle;
}) {
	return new ButtonBuilder()
		.setCustomId(options.customId)
		.setLabel(options.label)
		.setStyle(options.style);
}
