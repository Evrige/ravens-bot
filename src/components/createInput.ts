import {TextInputBuilder, TextInputStyle} from "discord.js";

export function createInput({
											 id,
											 label,
											 placeholder,
											 style,
											 defaultValue
										 }: {
	id: string;
	label: string;
	placeholder?: string;
	style: TextInputStyle;
	defaultValue?: string;
}) {
	const input = new TextInputBuilder()
		.setCustomId(id)
		.setLabel(label)
		.setStyle(style);

	if (placeholder) input.setPlaceholder(placeholder);
	if (defaultValue) input.setValue(defaultValue);

	return input;
}
