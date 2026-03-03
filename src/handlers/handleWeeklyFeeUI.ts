import {
	ActionRowBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import {checkRolesOrReply} from "../utils/checkRoles";
import {CUSTOM_IDS} from "../constants/customIds";
import {FAMILY_HIGH_ROLE_IDS} from "../config/staff";
import {prisma} from "../utils/prisma";
import {updateWeeklyFeePanel} from "../services/updateWeeklyFeePanel";

export async function handleWeeklyFeeUI(interaction: any) {
	// ✅ кнопка "Изменить цену"
	if (interaction.isButton?.() && interaction.customId === CUSTOM_IDS.WEEKLY_FEE_PRICE_EDIT) {
		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const settings = await prisma.weeklyFeeSettings.upsert({
			where: { id: 1 },
			update: {},
			create: { id: 1, price: 50000 }
		});

		const modal = new ModalBuilder()
			.setCustomId(CUSTOM_IDS.WEEKLY_FEE_PRICE_MODAL)
			.setTitle("Изменить цену взноса");

		const input = new TextInputBuilder()
			.setCustomId(CUSTOM_IDS.WEEKLY_FEE_PRICE_INPUT)
			.setLabel("Новая цена (монеты)")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setValue(String(settings.price));

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
		return interaction.showModal(modal);
	}

	// ✅ сабмит модалки (новая цена)
	if (interaction.isModalSubmit?.() && interaction.customId === CUSTOM_IDS.WEEKLY_FEE_PRICE_MODAL) {
		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const raw = interaction.fields.getTextInputValue(CUSTOM_IDS.WEEKLY_FEE_PRICE_INPUT);
		const price = Number(raw);

		if (!Number.isFinite(price) || price < 1) {
			return interaction.reply({ content: "❌ Цена должна быть числом >= 1", ephemeral: true });
		}

		await prisma.weeklyFeeSettings.upsert({
			where: { id: 1 },
			update: { price: Math.floor(price) },
			create: { id: 1, price: Math.floor(price) }
		});

		await updateWeeklyFeePanel(interaction.client);

		return interaction.reply({
			content: `✅ Цена взноса изменена на **${Math.floor(price).toLocaleString()}🪙**`,
			ephemeral: true
		});
	}
}