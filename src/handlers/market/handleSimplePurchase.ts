import { ButtonInteraction } from "discord.js";
import { prisma } from "../../utils/prisma";
import {Decimal} from "../../generated/prisma/internal/prismaNamespace";

export async function handleSimplePurchase(
	interaction: ButtonInteraction,
	item: { id: bigint; name: string; price: Decimal }
) {
	const userId = interaction.user.id;

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user)
		return interaction.reply({ content: "❌ Пользователь не найден.", ephemeral: true });

	if (user.balance < item.price)
		return interaction.reply({
			content: `❌ Недостаточно монет.`,
			ephemeral: true
		});

	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: { balance: { decrement: item.price } }
		}),
		prisma.selling.create({
			data: { userId, marketId: item.id }
		})
	]);

	await interaction.reply({
		content: `✅ Вы купили **${item.name}** за ${item.price} монет.`,
		ephemeral: true
	});
}