import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import {prisma} from "../../utils/prisma";
import {handleSimplePurchase} from "./handleSimplePurchase";
import {CUSTOM_IDS} from "../../constants/customIds";


export async function handleMarketButtons(interaction: ButtonInteraction) {
	if (!interaction.customId.startsWith(CUSTOM_IDS.MARKET_BUTTON)) return;

	const itemId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_BUTTON, ""));
	const userId = interaction.user.id;

	const item = await prisma.market.findUnique({ where: { id: itemId } });
	if (!item) return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });

	// Проверяем, если это товар типа кастомная роль
	if (item.name.toLowerCase().includes("роль")) {
		// Создаем модалку
		const modal = new ModalBuilder()
			.setCustomId(`role_buy_${item.id}`)
			.setTitle(`Купить ${item.name}`);

		const roleNameInput = new TextInputBuilder()
			.setCustomId("role_name")
			.setLabel("Название роли")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const roleColorInput = new TextInputBuilder()
			.setCustomId("role_color")
			.setLabel("Цвет роли (hex, например #FF0000)")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(roleNameInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(roleColorInput)
		);

		await interaction.showModal(modal);
		return;
	}

	// Иначе просто обычная покупка без модалки
	await handleSimplePurchase(interaction, userId, item);
}