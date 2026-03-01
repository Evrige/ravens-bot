import {
	ModalSubmitInteraction,
	GuildMember,
	PermissionsBitField, Guild
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_IDS } from "../../constants/customIds";

export async function handleRolePurchase(interaction: ModalSubmitInteraction) {
	const itemId = BigInt(interaction.customId.replace(CUSTOM_IDS.ROLE_BUY, ""));
	const userId = interaction.user.id;

	if (!interaction.guild) {
		return interaction.reply({
			content: "❌ Это действие доступно только на сервере.",
			ephemeral: true
		});
	}

	const me = interaction.guild.members.me;
	if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
		return interaction.reply({
			content: "❌ У бота нет права **Manage Roles**.",
			ephemeral: true
		});
	}

	const item = await prisma.market.findUnique({ where: { id: itemId } });
	if (!item) {
		return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });
	}

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.balance < item.price) {
		return interaction.reply({
			content: "❌ Недостаточно монет.",
			ephemeral: true
		});
	}

	const roleName = interaction.fields.getTextInputValue("role_name").trim();
	const roleColorRaw = interaction.fields.getTextInputValue("role_color").trim();

	const hex = roleColorRaw.startsWith("#")
		? roleColorRaw.slice(1)
		: roleColorRaw;

	if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
		return interaction.reply({
			content: "❌ Цвет должен быть в формате **#RRGGBB** (например: #ff00aa).",
			ephemeral: true
		});
	}

	const color = parseInt(hex, 16);

	const member = (await interaction.guild.members
		.fetch(userId)
		.catch(() => null)) as GuildMember | null;

	if (!member) {
		return interaction.reply({
			content: "❌ Не удалось найти участника на сервере.",
			ephemeral: true
		});
	}

	const role = await interaction.guild.roles.create({
		name: roleName,
		color,
		hoist: false,
		mentionable: false,
		permissions: [],
		reason: `Покупка цветовой роли ${interaction.user.tag}`
	});

	try {
		// ✅ Позиция: чуть выше ролей пользователя, но ниже роли бота
		const botTopPos = interaction.guild.members.me!.roles.highest.position;

		// Самая высокая роль пользователя (включая @everyone она не будет, это ок)
		const memberTopPos = member.roles.highest.position;

		// Хотим поставить роль на 1 выше пользователя, чтобы она стала "верхней" и дала цвет
		// Но не можем поднять выше роли бота
		let targetPos = memberTopPos + 1;
		targetPos = Math.max(1, targetPos);
		targetPos = Math.min(botTopPos - 1, targetPos);

		// Если botTopPos - 1 < 1, значит роль бота слишком низко (почти @everyone)
		if (targetPos < 1) targetPos = 1;

		if (role.position !== targetPos) {
			await role.setPosition(targetPos, {
				reason: "Позиция цветовой роли над ролями пользователя"
			});
		}

		await prisma.$transaction([
			prisma.user.update({
				where: { id: userId },
				data: { balance: { decrement: item.price } }
			}),
			prisma.role.create({
				data: {
					id: role.id,
					userId,
					name: role.name,
					color: `#${role.color.toString(16).padStart(6, "0")}`,
					price: item.price
				}
			})
		]);

		await member.roles.add(role.id, "Выдача купленной цветовой роли");

		return interaction.reply({
			content: `✅ Роль **${role.name}** создана и выдана вам!`,
			ephemeral: true
		});
	} catch (err) {
		await prisma
			.$transaction([
				prisma.user.update({
					where: { id: userId },
					data: { balance: { increment: item.price } }
				}),
				prisma.role.deleteMany({
					where: { id: role.id, userId }
				})
			])
			.catch(() => {});

		await role
			.delete("Откат: ошибка при покупке/позиции/выдаче роли")
			.catch(() => {});

		return interaction.reply({
			content:
				"❌ Не удалось выдать роль (проверь права бота и позицию его роли). Покупка отменена.",
			ephemeral: true
		});
	}
}