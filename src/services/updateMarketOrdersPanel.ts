import { Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { listOpenMarketOrders } from "./familyHistoryStore";
import { formatCoins, formatDateTime } from "../utils/formatters";

const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;
const BOT_MESSAGE_TYPE = "market_orders_panel";

function buildOrdersPanel(orders: Awaited<ReturnType<typeof listOpenMarketOrders>>) {
	const inProgress = orders.filter((order) => order.status === "IN_PROGRESS");
	const pending = orders.filter((order) => order.status === "PENDING");

	const linesFor = (items: typeof orders, active: boolean) => {
		if (!items.length) {
			return active
				? "Никто не держит заказы в работе."
				: "Открытых заказов сейчас нет.";
		}

		return items
			.map((order, index) => {
				const owner = active && order.takenById ? ` • взял <@${order.takenById}>` : "";
				return [
					`${index + 1}. **${order.marketName}** — <@${order.userId}>`,
					`Цена: **${formatCoins(order.marketPrice)}** 🪙${owner}`,
					`Создан: ${formatDateTime(order.createdAt)}`,
				].join("\n");
			})
			.join("\n\n");
	};

	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Очередь заказов маркета" },
			{
				type: V2.TextDisplay,
				content: "Здесь собраны все открытые и взятые в работу покупки. Панель обновляется автоматически."
			},
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### В работе" },
			{ type: V2.TextDisplay, content: linesFor(inProgress, true) },
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Открытые заказы" },
			{ type: V2.TextDisplay, content: linesFor(pending, false) },
		],
	};
}

async function resolveOrdersChannel(client: Client) {
	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_MARKET_LOG).catch(() => null);
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

export async function updateMarketOrdersPanel(client: Client) {
	const channel = await resolveOrdersChannel(client);
	if (!channel) return;

	const orders = await listOpenMarketOrders();
	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [buildOrdersPanel(orders)],
	};
	const payloadEdit: any = { components: [buildOrdersPanel(orders)] };

	const botMessage = await prisma.botMessage.findUnique({
		where: { type: BOT_MESSAGE_TYPE },
	});

	if (botMessage && botMessage.channelId === channel.id) {
		try {
			const existing = await channel.messages.fetch(botMessage.messageId);
			await existing.edit(payloadEdit);
			return;
		} catch (error: any) {
			if (error?.code !== 10008) {
				console.warn("[market-orders-panel] edit failed, recreating:", error);
			}
		}
	}

	const sent = await channel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { channelId: channel.id, messageId: sent.id },
		create: { type: BOT_MESSAGE_TYPE, channelId: channel.id, messageId: sent.id },
	});
}
