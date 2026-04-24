import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { getMarketSettings } from "../utils/marketSettingsStore";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;
const BOT_MESSAGE_TYPE = "market_embed";

function buildMarketV2(
	items: Array<{ id: bigint; name: string; price: unknown }>,
	isOpen: boolean
) {
	const pageItems = items.slice(0, 20);

	const container: any = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## 🛒 Магазин семьи" },
			{
				type: V2.TextDisplay,
				content: isOpen
					? "Магазин открыт. Покупай товары через кнопки справа."
					: "Магазин сейчас закрыт. Покупка временно недоступна.",
			},
			{ type: V2.Separator }
		]
	};

	if (!pageItems.length) {
		container.components.push({ type: V2.TextDisplay, content: "Пока что товаров нет." });
		return container;
	}

	for (let i = 0; i < pageItems.length; i++) {
		const item = pageItems[i];

		container.components.push({
			type: V2.Section,
			components: [{
				type: V2.TextDisplay,
				content: `**${item.name}**\nЦена: **${Number(item.price).toLocaleString("ru-RU")}** 🪙`,
			}],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				label: isOpen ? "Купить" : "Закрыто",
				custom_id: `${CUSTOM_IDS.MARKET_BUTTON}${item.id.toString()}`,
				disabled: !isOpen,
			}
		});

		if (i !== pageItems.length - 1) {
			container.components.push({ type: V2.Separator });
		}
	}

	return container;
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FAMILY_MARKET) {
		console.warn("[market] FAMILY_MARKET_CHANNEL_ID is not set");
		return null;
	}

	const fetchedChannel = await client.channels.fetch(CHANNEL_IDS.FAMILY_MARKET).catch((error) => {
		console.warn("[market] failed to fetch FAMILY_MARKET channel:", error);
		return null;
	});
	if (!fetchedChannel || !fetchedChannel.isTextBased()) return null;
	return fetchedChannel as TextChannel;
}

async function safeDeleteMessage(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) console.warn("market delete failed:", err);
	}
}

export async function updateMarket(client: Client, _channel?: TextChannel, forceRepost = false) {
	const targetChannel = await resolveTargetChannel(client);
	if (!targetChannel) return;

	const [items, settings] = await Promise.all([
		prisma.market.findMany({ orderBy: { id: "asc" } }),
		getMarketSettings(),
	]);
	const container = buildMarketV2(items as any, settings.isOpen);

	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components: [container] };
	const payloadEdit: any = { components: [container] };
	const botMsg = await prisma.botMessage.findUnique({ where: { type: BOT_MESSAGE_TYPE } });

	if (forceRepost) {
		if (botMsg && botMsg.channelId === targetChannel.id) {
			await safeDeleteMessage(targetChannel, botMsg.messageId);
		}

		const newMsg = await targetChannel.send(payloadSend);
		await prisma.botMessage.upsert({
			where: { type: BOT_MESSAGE_TYPE },
			update: { messageId: newMsg.id, channelId: targetChannel.id },
			create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: targetChannel.id }
		});
		return;
	}

	if (botMsg && botMsg.channelId === targetChannel.id) {
		try {
			const msg = await targetChannel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			if (err?.code !== 10008) {
				console.warn("market edit failed, recreating:", err);
			}
		}
	}

	const newMsg = await targetChannel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { messageId: newMsg.id, channelId: targetChannel.id },
		create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: targetChannel.id }
	});
}
