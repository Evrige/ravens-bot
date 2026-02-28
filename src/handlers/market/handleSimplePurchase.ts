import { ButtonInteraction } from "discord.js";
import { prisma } from "../../utils/prisma";
import {Decimal} from "@prisma/client/runtime/client";

export async function handleSimplePurchase(interaction: ButtonInteraction, userId: string, item: { id: bigint, name: string, price: Decimal }) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) return interaction.reply({ content: "❌ Пользователь не найден.", ephemeral: true });

	const userBalance = (user.balance as any).toNumber();
	const price = Number(item.price);

	if (userBalance < price) {
		return interaction.reply({ content: `❌ Недостаточно монет. Нужно ${price}, а у вас ${userBalance}.`, ephemeral: true });
	}

	// Списываем деньги и фиксируем покупку
	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: { balance: { decrement: item.price } }
		}),
		prisma.selling.create({
			data: { userId, marketId: item.id }
		})
	]);

	await interaction.reply({ content: `✅ Вы купили **${item.name}** за ${price} монет.`, ephemeral: true });
}