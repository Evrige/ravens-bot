import {ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel} from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { updateMarket } from "../../services/updateMarket";
import {prisma} from "../../utils/prisma";

export const marketCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET)
		.setDescription("Создать или пересоздать сообщение магазина в текущем канале"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const channel = interaction.channel;
		if (!channel || !channel.isTextBased()) {
			return interaction.editReply("❌ Эту команду можно использовать только в текстовом канале.");
		}

		await updateMarket(interaction.client, channel as TextChannel, true);
		return interaction.editReply("✅ Сообщение магазина обновлено.");
	}
};

export const marketAddCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET_ADD)
		.setDescription("Добавить товар в магазин")
		.addStringOption(o =>
			o.setName("name").setDescription("Название товара").setRequired(true)
		)
		.addIntegerOption(o =>
			o.setName("price")
				.setDescription("Цена товара")
				.setRequired(true)
				.setMinValue(1)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const name = interaction.options.getString("name", true);
		const price = interaction.options.getInteger("price", true);

		const newItem = await prisma.market.create({
			data: { name, price }
		});

		await updateMarket(interaction.client);

		return interaction.editReply(
			`✅ Товар **${newItem.name}** добавлен за ${price} монет.\nСообщение магазина обновлено.`
		);
	}
};

export const marketRemoveCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET_REMOVE)
		.setDescription("Удалить товар из магазина")
		.addStringOption(o =>
			o.setName("name").setDescription("Точное название товара").setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const name = interaction.options.getString("name", true).trim();

		const item = await prisma.market.findFirst({
			where: { name }
		});

		if (!item) {
			return interaction.editReply(`❌ Товар с названием **${name}** не найден.`);
		}

		await prisma.$transaction([
			prisma.selling.deleteMany({
				where: { marketId: item.id }
			}),
			prisma.market.delete({
				where: { id: item.id }
			})
		]);

		await updateMarket(interaction.client);

		return interaction.editReply(
			`✅ Товар **${item.name}** удалён из магазина.\nСообщение магазина обновлено.`
		);
	}
};
