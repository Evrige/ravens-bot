import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import {sendLog} from "../../utils/logger";

// --- Проверка прав ---
function checkOwnerRole(interaction: ChatInputCommandInteraction) {
	const memberRoles = interaction.member?.roles;
	if (!memberRoles || !('cache' in memberRoles)) return false;
	return FAMILY_OWNERS_ROLE_IDS.some(roleId => memberRoles.cache.has(roleId));
}

// --- Функция для отправки ЛС ---
async function sendDM(interaction: ChatInputCommandInteraction, targetUserId: string, message: string) {
	try {
		const discordUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
		if (discordUser) await discordUser.send(message).catch(() => null);
	} catch {}
}

// --- Функция для обновления ролей варнов ---
async function updateWarnRoles(member: any, warnCount: number) {
	const warn1 = member.guild.roles.cache.find((r: any) => r.name === "warn 1/3");
	const warn2 = member.guild.roles.cache.find((r: any) => r.name === "warn 2/3");

	if (!warn1 || !warn2) return;

	await member.roles.remove([warn1.id, warn2.id]).catch(() => null);
	if (warnCount === 1) await member.roles.add(warn1.id).catch(() => null);
	if (warnCount === 2) await member.roles.add(warn2.id).catch(() => null);
}

// --- /warn ---
export const warnCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.WARN)
		.setDescription("Выдать предупреждение пользователю")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction)) return interaction.reply({ content: "Нет прав", ephemeral: true });

		const targetUser = interaction.options.getUser("target");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!targetUser) return interaction.reply({ content: "Пользователь не выбран", ephemeral: true });

		let dbUser = await prisma.user.findUnique({ where: { id: targetUser.id } });
		if (!dbUser) dbUser = await prisma.user.create({ data: { id: targetUser.id } });

		const newWarns = dbUser.warn + 1;
		const isBan = newWarns >= 3;

		await prisma.user.update({ where: { id: targetUser.id }, data: { warn: newWarns, isBan } });

		const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

		if (member) {
			await updateWarnRoles(member, newWarns); // Обновляем роли варнов
		}

		await sendDM(interaction, targetUser.id, `Вам выдан варн (${newWarns}/3) от ${issuer.tag}. Причина: ${reason}`);

		if (isBan && member) {
			await member.ban({ reason: `3 предупреждения: ${reason}` });
			await sendDM(interaction, targetUser.id, `Вы были забанены за 3 предупреждения от ${issuer.tag}.`);

			// Лог для 3 варнов
			await sendLog({
				guild: interaction.guild!,
				message: `⛔ Пользователь ${targetUser.tag} получил 3/3 предупреждения и был забанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
			});

			return interaction.reply({
				content: `⛔ Пользователь ${targetUser.tag} получил 3/3 предупреждений и был забанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
				ephemeral: true
			});
		}
		await sendLog({
			guild: interaction.guild!,
			message: `⚠️ Пользователь ${targetUser.tag} получил предупреждение (${newWarns}/3)\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
		});
		return interaction.reply({
			content: `⚠️ Пользователь ${targetUser.tag} получил предупреждение (${newWarns}/3)\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
			ephemeral: true
		});
	}
};

// --- /unwarn ---
export const unwarnCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.UNWARN)
		.setDescription("Убрать предупреждение у пользователя")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction)) return interaction.reply({ content: "Нет прав", ephemeral: true });

		const targetUser = interaction.options.getUser("target");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!targetUser) return interaction.reply({ content: "Пользователь не выбран", ephemeral: true });

		let dbUser = await prisma.user.findUnique({ where: { id: targetUser.id } });
		if (!dbUser) return interaction.reply({ content: "Пользователь не найден", ephemeral: true });

		const newWarns = Math.max(dbUser.warn - 1, 0);
		await prisma.user.update({ where: { id: targetUser.id }, data: { warn: newWarns } });

		const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
		if (member) await updateWarnRoles(member, newWarns);
		await sendLog({
			guild: interaction.guild!,
			message: `✅ С пользователя ${targetUser.tag} снято предупреждение.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}\n📊 Сейчас предупреждений: ${newWarns}/3`
		});
		await sendDM(interaction, targetUser.id, `У вас снято предупреждение от ${issuer.tag}. Сейчас варнов: ${newWarns}. Причина: ${reason}`);
		interaction.reply({
			content: `✅ С пользователя ${targetUser.tag} снято предупреждение.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}\n📊 Сейчас предупреждений: ${newWarns}/3`,
			ephemeral: true
		});
	}
};

// --- /ban ---
export const banCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BAN)
		.setDescription("Забанить пользователя")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction)) return interaction.reply({ content: "Нет прав", ephemeral: true });

		const targetUser = interaction.options.getUser("target");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!targetUser) return interaction.reply({ content: "Пользователь не выбран", ephemeral: true });

		await prisma.user.update({ where: { id: targetUser.id }, data: { isBan: true } });

		const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
		if (member) await member.ban({ reason });
		await sendLog({
			guild: interaction.guild!,
			message: `⛔ Пользователь ${targetUser.tag} забанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
		});
		await sendDM(interaction, targetUser.id, `Вы были забанены от ${issuer.tag}. Причина: ${reason}`);
		interaction.reply({
			content: `⛔ Пользователь ${targetUser.tag} забанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
			ephemeral: true
		});
	}
};

// --- /unban ---
export const unbanCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.UNBAN)
		.setDescription("Разбанить пользователя")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction)) return interaction.reply({ content: "Нет прав", ephemeral: true });

		const targetUser = interaction.options.getUser("target");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!targetUser) return interaction.reply({ content: "Пользователь не выбран", ephemeral: true });

		await prisma.user.update({ where: { id: targetUser.id }, data: { isBan: false } });
		await interaction.guild?.members.unban(targetUser.id).catch(() => null);
		await sendLog({
			guild: interaction.guild!,
			message: `✅ Пользователь ${targetUser.tag} разбанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
		});
		await sendDM(interaction, targetUser.id, `Вы были разбанены от ${issuer.tag}. Причина: ${reason}`);
		interaction.reply({
			content: `✅ Пользователь ${targetUser.tag} разбанен.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
			ephemeral: true
		});
	}
};

export const muteCommand = {
	data: new SlashCommandBuilder()
		.setName("mute")
		.setDescription("Выдать тайм-аут пользователю (в минутах)")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addIntegerOption(opt => opt.setName("duration").setDescription("Время в минутах").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction))
			return interaction.reply({ content: "Нет прав", ephemeral: true });

		const member = interaction.options.getMember("target");
		const duration = interaction.options.getInteger("duration");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!member || !("timeout" in member))
			return interaction.reply({ content: "Пользователь не найден", ephemeral: true });

		// Выдаём тайм-аут
		await member.timeout(duration! * 60 * 1000, reason).catch(() => null);

		// Обновляем БД
		await prisma.user.update({
			where: { id: member.id },
			data: { isMute: true }
		}).catch(() => null);

		// ЛС
		await sendDM(
			interaction,
			member.id,
			`Вы получили тайм-аут от ${issuer.tag} на ${duration} минут.\nПричина: ${reason}`
		);
		await sendLog({
			guild: interaction.guild!,
			message: `🔇 Пользователь ${member.user.tag} получил тайм-аут.\n⏱ Время: ${duration !== null ? duration.toString() : "не указано"} минут\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
		});
		await interaction.reply({
			content: `🔇 Пользователь ${member.user.tag} получил тайм-аут.\n⏱ Время: ${duration} минут\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
			ephemeral: true
		});
	}
};

// --- /unmute ---
export const unmuteCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.UNMUTE)
		.setDescription("Снять тайм-аут с пользователя")
		.addUserOption(opt => opt.setName("target").setDescription("Пользователь").setRequired(true))
		.addStringOption(opt => opt.setName("reason").setDescription("Причина").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!checkOwnerRole(interaction))
			return interaction.reply({ content: "Нет прав", ephemeral: true });

		const member = interaction.options.getMember("target");
		const reason = interaction.options.getString("reason") || "Не указана";
		const issuer = interaction.user;

		if (!member || !("timeout" in member))
			return interaction.reply({ content: "Пользователь не найден", ephemeral: true });

		// Снимаем тайм-аут
		await member.timeout(null, reason).catch(() => null);

		// Обновляем БД
		await prisma.user.update({
			where: { id: member.id },
			data: { isMute: false }
		}).catch(() => null);

		// ЛС
		await sendDM(
			interaction,
			member.id,
			`Ваш тайм-аут снят ${issuer.tag}.\nПричина: ${reason}`
		);
		await sendLog({
			guild: interaction.guild!,
			message: `🔊 Тайм-аут с пользователя ${member.user.tag} снят.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`
		});
		await interaction.reply({
			content: `🔊 Тайм-аут с пользователя ${member.user.tag} снят.\n👮 Модератор: ${issuer.tag}\n📄 Причина: ${reason}`,
			ephemeral: true
		});
	}
};