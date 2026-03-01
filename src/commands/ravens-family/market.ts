import {ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder} from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { updateMarket } from "../../services/updateMarket";
import {prisma} from "../../utils/prisma";

export const marketCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.MARKET)
		.setDescription("Пересоздать сообщение магазина в канале"),

	async execute(interaction: ChatInputCommandInteraction) {
		// ✅ сразу ACK
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		// ✅ потом роли
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		// ✅ принудительный репост
		await updateMarket(interaction.client, true);

		return interaction.editReply("✅ Магазин пересоздан.");
		// если хочешь без ответа:
		// await interaction.deleteReply().catch(() => {});
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
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const name = interaction.options.getString("name", true);
		const price = interaction.options.getInteger("price", true);

		const newItem = await prisma.market.create({
			data: { name, price }
		});

		// ✅ сразу обновляем публичный магазин
		await updateMarket(interaction.client);

		await interaction.reply({
			content: `✅ Товар **${newItem.name}** добавлен за ${price} монет.\n🛒 Магазин в канале обновлён.`,
			ephemeral: true
		});
	}
};