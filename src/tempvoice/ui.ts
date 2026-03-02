import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	UserSelectMenuBuilder,
} from "discord.js";
import { IDS } from "./ids";

export function buildPanelEmbed() {
	return new EmbedBuilder()
		.setTitle("TempVoice Interface")
		.setDescription(
			"This interface can be used to manage temporary voice channels.\n" +
			"More options are available with /voice commands.\n\n" +
			"Press the buttons below to use the interface."
		);
}

export function buildPanelComponents() {
	const S = ButtonStyle.Secondary;

	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(IDS.BTN_NAME).setLabel("NAME").setEmoji("🏷️").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_LIMIT).setLabel("LIMIT").setEmoji("👥").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_PRIVACY).setLabel("PRIVACY").setEmoji("🛡️").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_WAIT).setLabel("WAITING R.").setEmoji("🕒").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_CHAT).setLabel("CHAT").setEmoji("💬").setStyle(S),
	);

	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(IDS.BTN_TRUST).setLabel("TRUST").setEmoji("✅").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_UNTRUST).setLabel("UNTRUST").setEmoji("🚫").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_INVITE).setLabel("INVITE").setEmoji("✉️").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_KICK).setLabel("KICK").setEmoji("👢").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_REGION).setLabel("REGION").setEmoji("🌍").setStyle(S),
	);

	const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(IDS.BTN_BLOCK).setLabel("BLOCK").setEmoji("⛔").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_UNBLOCK).setLabel("UNBLOCK").setEmoji("🔓").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_CLAIM).setLabel("CLAIM").setEmoji("👑").setStyle(S),
		new ButtonBuilder().setCustomId(IDS.BTN_TRANSFER).setLabel("TRANSFER").setEmoji("🔁").setStyle(S),
		// Хочешь вообще без цветов — поставь Secondary вместо Danger
		new ButtonBuilder().setCustomId(IDS.BTN_DELETE).setLabel("DELETE").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
	);

	return [row1, row2, row3];
}

export function buildRenameModal() {
	const modal = new ModalBuilder().setCustomId(IDS.MODAL_NAME).setTitle("Rename channel");
	const nameInput = new TextInputBuilder()
		.setCustomId("name")
		.setLabel("New channel name")
		.setStyle(TextInputStyle.Short)
		.setMaxLength(90)
		.setRequired(true);

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
	return modal;
}

export function buildLimitModal() {
	const modal = new ModalBuilder().setCustomId(IDS.MODAL_LIMIT).setTitle("Set user limit");
	const limitInput = new TextInputBuilder()
		.setCustomId("limit")
		.setLabel("0-99 (0 = unlimited)")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput));
	return modal;
}

export function buildUserSelect(customId: string, placeholder: string) {
	return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
		new UserSelectMenuBuilder()
			.setCustomId(customId)
			.setPlaceholder(placeholder)
			.setMinValues(1)
			.setMaxValues(1),
	);
}