import {ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits} from "discord.js";
import { prisma } from "../../utils/prisma";
import {checkRolesOrReply} from "../../utils/checkRoles";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {CUSTOM_COMMAND} from "../../constants/customIds";
import {Decimal} from "@prisma/client/runtime/client";

export const marketCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET)
		.setDescription("Список товаров в магазине"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;
		try {
			await interaction.deferReply({ ephemeral: true });

			const items = await prisma.market.findMany();

			if (!items.length) {
				await interaction.editReply("В магазине пока нет товаров.");
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle("🛒 Магазин")
				.setColor("#FFD700")
				.setDescription(
					items.map(item => `**${item.name}** — ${Number(item.price).toLocaleString()} монет`).join("\n")
				);

			await interaction.editReply({ embeds: [embed] });
		} catch (err) {
			console.error("Ошибка market:", err);
			await interaction.editReply("Ошибка при получении товаров магазина.");
		}
	}
};

export const marketAddCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET_ADD)
		.setDescription("Добавить товар в магазин")
		.addStringOption(option =>
			option.setName("name")
				.setDescription("Название товара")
				.setRequired(true)
		)
		.addNumberOption(option =>
			option.setName("price")
				.setDescription("Цена товара")
				.setRequired(true)
				.setMinValue(1)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // только управляющие сервером

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const name = interaction.options.getString("name", true);
		const price = interaction.options.getNumber("price", true);

		try {
			const newItem = await prisma.market.create({
				data: {
					name,
					price: Decimal(price)
				}
			});

			await interaction.reply({ content: `✅ Товар **${newItem.name}** добавлен в магазин за ${price} монет.`, ephemeral: true });
		} catch (err) {
			console.error("Ошибка добавления товара:", err);
			await interaction.reply({ content: "❌ Ошибка при добавлении товара в магазин.", ephemeral: true });
		}
	}
};