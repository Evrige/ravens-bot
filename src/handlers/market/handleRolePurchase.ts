import {prisma} from "../../utils/prisma";
import {Guild} from "discord.js";

export async function handleRolePurchase(
	guild: Guild,
	userId: string,
	roleName: string,
	roleColor: string,
	price: number,
	itemId: bigint
) {
	const roleColorHex = parseInt(roleColor.replace("#", ""), 16);

	// Создаём роль
	const role = await guild.roles.create({
		name: roleName,
		color: roleColorHex,
		reason: `Кастомная роль куплена пользователем ${userId}`
	});

	// Сохраняем в БД
	await prisma.role.create({
		data: {
			id: role.id,
			userId,
			price,
			name: role.name,
			color: `#${role.color.toString(16).padStart(6, "0")}`
		}
	});

	// Отмечаем товар как купленный
	await prisma.market.update({
		where: { id: itemId },
		data: { roleId: role.id }
	});

	// Списываем монеты
	await prisma.user.update({
		where: { id: userId },
		data: { balance: { decrement: price } }
	});

	return role;
}