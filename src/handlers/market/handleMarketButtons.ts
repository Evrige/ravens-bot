import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_IDS } from "../../constants/customIds";
import { CHANNEL_IDS } from "../../config/channels";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { updateMarket } from "../../services/updateMarket";
import { upsertMarketAdminPanel } from "../../services/upsertMarketAdminPanel";
import { getMarketSettings, mutateMarketSettings } from "../../utils/marketSettingsStore";
import {
	completeMarketOrder,
	createMarketOrder,
	declineMarketOrder,
	getMarketOrder,
	MarketOrderRecord,
	setMarketOrderLogMessage,
	takeMarketOrder,
} from "../../services/familyHistoryStore";
import { decimalToNumber, formatCoins, formatDateTime } from "../../utils/formatters";
import { updateMarketOrdersPanel } from "../../services/updateMarketOrdersPanel";

function hasMarketOrderAccess(interaction: ButtonInteraction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return [...FAMILY_HIGH_ROLE_IDS, ...FAMILY_OWNERS_ROLE_IDS].some((roleId) => roleCache.has(roleId));
}

function hasMarketManageAccess(interaction: ButtonInteraction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_OWNERS_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function buildAddMarketModal() {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.MARKET_MODAL_ADD)
		.setTitle("Добавить товар");

	const nameInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.MARKET_MODAL_NAME)
		.setLabel("Название товара")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const priceInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.MARKET_MODAL_PRICE)
		.setLabel("Цена")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
	);

	return modal;
}

function buildEditMarketModal(item: { id: bigint; name: string; price: unknown }) {
	const modal = new ModalBuilder()
		.setCustomId(`${CUSTOM_IDS.MARKET_MODAL_EDIT_ITEM}${item.id.toString()}`)
		.setTitle("Изменить товар");

	const nameInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.MARKET_MODAL_NAME)
		.setLabel("Название товара / DELETE")
		.setStyle(TextInputStyle.Short)
		.setValue(item.name)
		.setRequired(true);

	const priceInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.MARKET_MODAL_PRICE)
		.setLabel("Цена")
		.setStyle(TextInputStyle.Short)
		.setValue(decimalToNumber(item.price).toString())
		.setRequired(true);

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
	);

	return modal;
}

function buildOrderButtons(order: MarketOrderRecord, disabled = false) {
	const isPending = order.status === "PENDING";
	const isResolved = order.status === "COMPLETED" || order.status === "DECLINED";

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.MARKET_ORDER_TAKE}${order.id.toString()}`)
			.setLabel("В работу")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled || !isPending),
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.MARKET_ORDER_COMPLETE}${order.id.toString()}`)
			.setLabel("Выполнен")
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled || isResolved),
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.MARKET_ORDER_DECLINE}${order.id.toString()}`)
			.setLabel("Не выполнен")
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled || isResolved)
	);
}

function buildOrderEmbed(order: MarketOrderRecord) {
	const statusMap = {
		PENDING: { text: "Ожидает выполнения", color: 0xfaa61a },
		IN_PROGRESS: { text: "В работе", color: 0x5865f2 },
		COMPLETED: { text: "✅ Выполнен", color: 0x57f287 },
		DECLINED: { text: "❌ Не выполнен", color: 0xed4245 },
	} as const;

	const status = statusMap[order.status];
	const embed = new EmbedBuilder()
		.setColor(status.color)
		.setTitle("Новый заказ в маркете")
		.addFields(
			{ name: "Покупатель", value: `<@${order.userId}>`, inline: true },
			{ name: "ID пользователя", value: order.userId, inline: true },
			{ name: "Товар", value: order.marketName, inline: false },
			{ name: "Цена", value: `${formatCoins(order.marketPrice)} 🪙`, inline: true },
			{ name: "Статус заказа", value: status.text, inline: true },
		)
		.setFooter({ text: `Market Order ID: ${order.id.toString()}` })
		.setTimestamp(order.createdAt);

	if (order.takenById) {
		embed.addFields({
			name: "Взял в работу",
			value: `<@${order.takenById}>${order.takenAt ? ` • ${formatDateTime(order.takenAt)}` : ""}`,
			inline: false,
		});
	}

	if (order.resolvedById) {
		embed.addFields({
			name: order.status === "COMPLETED" ? "Выполнил" : "Обработал",
			value: `<@${order.resolvedById}>${order.resolvedAt ? ` • ${formatDateTime(order.resolvedAt)}` : ""}`,
			inline: false,
		});
	}

	if (order.declineReason) {
		embed.addFields({
			name: "Причина",
			value: order.declineReason,
			inline: false,
		});
	}

	return embed;
}

async function refreshOrderMessage(interaction: ButtonInteraction, order: MarketOrderRecord) {
	await interaction.update({
		embeds: [buildOrderEmbed(order)],
		components: [buildOrderButtons(order, order.status === "COMPLETED" || order.status === "DECLINED")],
	}).catch(() => {});

	await updateMarketOrdersPanel(interaction.client).catch(() => {});
}

async function handleTakeOrder(interaction: ButtonInteraction, orderId: bigint) {
	if (!hasMarketOrderAccess(interaction)) {
		await interaction.reply({
			content: "❌ У тебя нет прав на обработку этого заказа.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const order = await takeMarketOrder(orderId, interaction.user.id);
	if (!order) {
		await interaction.reply({
			content: "ℹ️ Этот заказ уже взяли в работу или обработали.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await refreshOrderMessage(interaction, order);
	return true;
}

async function refreshMarketPanels(client: ButtonInteraction["client"]) {
	await updateMarket(client).catch(() => {});
	await upsertMarketAdminPanel(client).catch(() => {});
}

async function handleResolveOrder(interaction: ButtonInteraction, orderId: bigint, completed: boolean) {
	if (!hasMarketOrderAccess(interaction)) {
		await interaction.reply({
			content: "❌ У тебя нет прав на обработку этого заказа.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const currentOrder = await getMarketOrder(orderId);
	if (!currentOrder) {
		await interaction.reply({
			content: "❌ Заказ не найден.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const order = completed
		? await completeMarketOrder(orderId, interaction.user.id)
		: await declineMarketOrder(orderId, interaction.user.id);

	if (!order) {
		await interaction.reply({
			content: "ℹ️ Этот заказ уже обработан.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (!completed) {
		await prisma.user.update({
			where: { id: order.userId },
			data: { balance: { increment: currentOrder.marketPrice as any } },
		}).catch(() => {});
	}

	await refreshOrderMessage(interaction, order);

	const user = await interaction.client.users.fetch(order.userId).catch(() => null);
	if (user) {
		await user.send(
			completed
				? `✅ Ваш заказ **${order.marketName}** выполнен.`
				: `❌ Ваш заказ **${order.marketName}** не выполнен. Монеты возвращены.`
		).catch(() => {});
	}

	return true;
}

export async function handleMarketButtons(interaction: ButtonInteraction) {
	if (interaction.customId === CUSTOM_IDS.MARKET_TOGGLE_STATE) {
		if (!hasMarketManageAccess(interaction)) {
			await interaction.reply({
				content: "❌ Управлять магазином могут только владельцы.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		const settings = await mutateMarketSettings((state) => {
			state.isOpen = !state.isOpen;
			return { ...state };
		});

		await refreshMarketPanels(interaction.client);
		await interaction.editReply(
			settings.isOpen
				? "✅ Магазин открыт. Покупки снова доступны."
				: "✅ Магазин закрыт. Кнопки покупки отключены."
		).catch(() => {});
		return true;
	}

	if (interaction.customId === CUSTOM_IDS.MARKET_MANAGE_ADD) {
		if (!hasMarketManageAccess(interaction)) {
			await interaction.reply({
				content: "❌ Управлять товарами могут только владельцы.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.showModal(buildAddMarketModal()).catch(() => {});
		return true;
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.MARKET_MANAGE_EDIT_ITEM)) {
		if (!hasMarketManageAccess(interaction)) {
			await interaction.reply({
				content: "❌ Управлять товарами могут только владельцы.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		const itemIdRaw = interaction.customId.slice(CUSTOM_IDS.MARKET_MANAGE_EDIT_ITEM.length);
		let itemId: bigint;
		try {
			itemId = BigInt(itemIdRaw);
		} catch {
			await interaction.reply({
				content: "❌ Некорректный ID товара.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		const item = await prisma.market.findUnique({ where: { id: itemId } });
		if (!item) {
			await interaction.reply({
				content: "❌ Товар не найден.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.showModal(buildEditMarketModal(item)).catch(() => {});
		return true;
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.MARKET_ORDER_TAKE)) {
		const orderId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_ORDER_TAKE, ""));
		return handleTakeOrder(interaction, orderId);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.MARKET_ORDER_COMPLETE)) {
		const orderId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_ORDER_COMPLETE, ""));
		return handleResolveOrder(interaction, orderId, true);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.MARKET_ORDER_DECLINE)) {
		const orderId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_ORDER_DECLINE, ""));
		return handleResolveOrder(interaction, orderId, false);
	}

	if (interaction.customId.startsWith("market_info_")) {
		const itemId = BigInt(interaction.customId.replace("market_info_", ""));
		const item = await prisma.market.findUnique({ where: { id: itemId } });

		if (!item) {
			return interaction.reply({ content: "❌ Товар не найден.", ephemeral: true });
		}

		return interaction.reply({
			content: `ℹ️ **${item.name}**\nЦена: 🪙 ${formatCoins(item.price)}`,
			ephemeral: true,
		});
	}

	if (!interaction.customId.startsWith(CUSTOM_IDS.MARKET_BUTTON)) return;

	await interaction.deferReply({ ephemeral: true }).catch(() => {});

	const settings = await getMarketSettings();
	if (!settings.isOpen) {
		return interaction.editReply({
			content: "❌ Магазин сейчас закрыт. Покупка временно недоступна.",
		});
	}

	const itemId = BigInt(interaction.customId.replace(CUSTOM_IDS.MARKET_BUTTON, ""));
	const item = await prisma.market.findUnique({ where: { id: itemId } });

	if (!item) {
		return interaction.editReply({
			content: "❌ Товар не найден.",
		});
	}

	const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
	if (!user) {
		return interaction.editReply({
			content: "❌ Пользователь не найден.",
		});
	}

	const userBalance = decimalToNumber(user.balance);
	const itemPrice = decimalToNumber(item.price);

	if (userBalance < itemPrice) {
		return interaction.editReply({
			content: `❌ Недостаточно монет. Цена товара: ${itemPrice.toLocaleString("ru-RU")} 🪙`,
		});
	}

	const result = await prisma.$transaction(async (tx) => {
		await tx.user.update({
			where: { id: interaction.user.id },
			data: { balance: { decrement: item.price } },
		});

		return tx.selling.create({
			data: { userId: interaction.user.id, marketId: item.id },
		});
	});

	const order = await createMarketOrder({
		sellingId: result.id,
		userId: interaction.user.id,
		marketId: item.id,
		marketName: item.name,
		marketPrice: item.price,
	});
	if (!order) {
		return interaction.editReply({
			content: "⚠️ Товар куплен, но таблица истории заказов ещё не создана. Примени миграцию Prisma.",
		});
	}

	const logChannel = await interaction.client.channels
		.fetch(CHANNEL_IDS.FAMILY_MARKET_LOG)
		.catch(() => null);

	if (logChannel && logChannel.isTextBased() && "send" in logChannel) {
		const logMessage = await logChannel.send({
			embeds: [buildOrderEmbed(order)],
			components: [buildOrderButtons(order)],
		}).catch(() => null);

		if (logMessage) {
			await setMarketOrderLogMessage(order.id, {
				channelId: logMessage.channelId,
				messageId: logMessage.id,
			}).catch(() => {});
		}
	}

	await updateMarketOrdersPanel(interaction.client).catch(() => {});

	return interaction.editReply({
		content: `✅ Вы купили **${item.name}** за ${formatCoins(item.price)} монет.`,
	});
}
