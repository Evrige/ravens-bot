import { ChatInputCommandInteraction, Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import { checkRolesOrReply } from "../../utils/checkRoles";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {CUSTOM_COMMAND} from "../../constants/customIds";
import { formatCoins } from "../../utils/formatters";
import { sendFamilyAuditCustomEmbed } from "../../services/startFamilyAuditLogger";

// balance
export const balanceCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BALANCE)
		.setDescription("Количество монет у пользователя"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// Отложенный ответ
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const user = await prisma.user.findUnique({
				where: { id: interaction.user.id }
			});

			if (!user) {
				await interaction.editReply("Пользователь не найден в базе.");
				return;
			}

			// Конвертация Decimal в number
			const balance = (user.balance as any).toNumber();

			// После deferReply используем editReply
			await interaction.editReply(`💰 Ваш баланс: ${balance.toFixed(2)} монет`);
		} catch (err) {
			console.error("Ошибка balance:", err);

			// Проверка, был ли уже ответ
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Ошибка при получении баланса", flags: MessageFlags.Ephemeral });
			} else {
				await interaction.editReply("Ошибка при получении баланса");
			}
		}
	}
};


// ===== /give =====
export const giveCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BALANCE_GIVE)
		.setDescription("Выдать монеты пользователю")
		.addUserOption(option =>
			option.setName("user")
				.setDescription("Пользователь")
				.setRequired(true)
		)
		.addNumberOption(option =>
			option.setName("amount")
				.setDescription("Количество монет")
				.setRequired(true)
				.setMinValue(1)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const target = interaction.options.getUser("user", true);
		const amount = interaction.options.getNumber("amount", true);

		const user = await prisma.user.upsert({
			where: { id: target.id },
			update: { balance: { increment: amount } },
			create: { id: target.id, balance: amount }
		});

		const newBalance = (user.balance as any).toNumber();

		const embed = new EmbedBuilder()
			.setTitle("Выданы монеты")
			.setColor(Colors.Green)
			.addFields(
				{ name: "Исполнитель", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Получатель", value: `<@${target.id}>`, inline: true },
				{ name: "Сумма", value: `${formatCoins(amount)} 🪙`, inline: true },
				{ name: "Новый баланс", value: `${formatCoins(newBalance)} 🪙`, inline: true },
			)
			.setTimestamp();

		await sendFamilyAuditCustomEmbed(interaction.client, "balance", embed).catch(() => {});

		await interaction.reply({
			content: `✅ Выдали ${amount} монет пользователю <@${target.id}>. Новый баланс: ${newBalance.toFixed(2)} монет`,
			flags: MessageFlags.Ephemeral
		});
	}
};

// ================= /take =================
export const takeCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BALANCE_TAKE)
		.setDescription("Забрать монеты у пользователя")
		.addUserOption(option => option.setName("user").setDescription("Пользователь").setRequired(true))
		.addNumberOption(option => option.setName("amount").setDescription("Количество монет").setRequired(true).setMinValue(1)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const target = interaction.options.getUser("user", true);
		const amount = interaction.options.getNumber("amount", true);

		const user = await prisma.user.findUnique({ where: { id: target.id } });
		if (!user) {
			return interaction.reply({
				content: "Пользователь не найден в базе.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const currentBalance = (user.balance as any).toNumber();
		const actualTaken = Math.min(amount, currentBalance); // Сколько реально можно забрать
		const newBalance = currentBalance - actualTaken;

		const updatedUser = await prisma.user.update({
			where: { id: target.id },
			data: { balance: newBalance }
		});

		const embed = new EmbedBuilder()
			.setTitle("Сняты монеты")
			.setColor(Colors.Red)
			.addFields(
				{ name: "Исполнитель", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Получатель", value: `<@${target.id}>`, inline: true },
				{ name: "Снято", value: `${formatCoins(actualTaken)} 🪙`, inline: true },
				{ name: "Новый баланс", value: `${formatCoins(updatedUser.balance)} 🪙`, inline: true },
			)
			.setTimestamp();

		await sendFamilyAuditCustomEmbed(interaction.client, "balance", embed).catch(() => {});

		await interaction.reply({
			content: `✅ Забрали ${actualTaken} монет у <@${target.id}>. Новый баланс: ${(updatedUser.balance as any).toNumber().toFixed(2)} монет`,
			flags: MessageFlags.Ephemeral,
		});
	}
};

export const balanceCheckCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.BALANCE_CHECK)
		.setDescription("Проверить баланс другого пользователя")
		.addUserOption(option => option.setName("user").setDescription("Пользователь").setRequired(true)),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const target = interaction.options.getUser("user", true);
		const user = await prisma.user.findUnique({ where: { id: target.id } });

		if (!user) return interaction.reply({ content: "Пользователь не найден в базе.", flags: MessageFlags.Ephemeral });

		const balance = (user.balance as any).toNumber();
		await interaction.reply({ content: `💰 Баланс <@${target.id}>: ${balance.toFixed(2)} монет`, flags: MessageFlags.Ephemeral });
	}
};
