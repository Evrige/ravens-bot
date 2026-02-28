import { ModalSubmitInteraction } from "discord.js";
import { prisma } from "../../utils/prisma";
import { handleRolePurchase } from "./handleRolePurchase";

export async function handleMarketModalSubmit(interaction: ModalSubmitInteraction) {
	// Проверяем, что это модалка для покупки роли
	if (!interaction.customId.startsWith("role_buy_")) return;

	const itemId = BigInt(interaction.customId.replace("role_buy_", ""));
	const userId = interaction.user.id;

	// Получаем товар
	const item = await prisma.market.findUnique({ where: { id: itemId } });
	if (!item) return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });

	const roleName = interaction.fields.getTextInputValue("role_name");
	const roleColor = interaction.fields.getTextInputValue("role_color");

	const price = Number(item.price);

	try {
		// Вызов логики покупки роли
		const newRole = await handleRolePurchase(
			interaction.guild!,
			userId,
			roleName,
			roleColor,
			price,
			item.id
		);

		await interaction.reply({
			content: `✅ Вы купили роль **${newRole?.name}** за ${price} монет.`,
			ephemeral: true
		});
	} catch (err: any) {
		await interaction.reply({ content: `❌ Ошибка покупки: ${err.message}`, ephemeral: true });
	}
}