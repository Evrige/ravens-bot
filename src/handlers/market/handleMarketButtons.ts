import {
	ButtonInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder
} from "discord.js";
import { prisma } from "../../utils/prisma";
import {handleSimplePurchase} from "./handleSimplePurchase";
import {CUSTOM_IDS} from "../../constants/customIds";
import {createInput} from "../../components/createInput";

export async function handleMarketButtons(interaction: ButtonInteraction) {
	if (interaction.customId.startsWith("market_info_")) {
		const itemId = BigInt(interaction.customId.replace("market_info_", ""));
		const item = await prisma.market.findUnique({ where: { id: itemId } });

		if (!item)
			return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });

		return interaction.reply({
			content: `ℹ️ **${item.name}**\nЦена: 🪙 ${Number(item.price).toLocaleString()}`,
			ephemeral: true
		});
	}
	if (!interaction.customId.startsWith(CUSTOM_IDS.MARKET_BUTTON)) return;

	const itemId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_BUTTON, ""));
	const item = await prisma.market.findUnique({ where: { id: itemId } });

	if (!item)
		return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });

	// если кастомная роль
	if (item.name.toLowerCase().includes("роль")) {
		const modal = new ModalBuilder()
			.setCustomId(`${CUSTOM_IDS.ROLE_BUY}${item.id}`)
			.setTitle(`Купить ${item.name}`);
		const roleNameInput = createInput({
			id: "role_name",
			label: "Название роли",
			style: TextInputStyle.Short
		})

		const roleColorInput = createInput({
			id: "role_color",
			label: "Цвет роли (#FF0000)",
			style: TextInputStyle.Short,
			defaultValue: "#"
		})

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(roleNameInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(roleColorInput)
		);

		return interaction.showModal(modal);
	}

	await handleSimplePurchase(interaction, item);
}