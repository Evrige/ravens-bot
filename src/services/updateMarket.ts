import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;

function buildMarketV2(items: Array<{ id: bigint; name: string; price: any }>) {
	const pageItems = items.slice(0, 10);

	const container: any = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## 🛒 Магазин" },
			{ type: V2.TextDisplay, content: "Нажми на кнопку справа, чтобы купить товар.\nЦены указаны в монетах." },
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
			components: [{ type: V2.TextDisplay, content: `🏷️ **${item.name}**` }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				label: `${Number(item.price).toLocaleString()}🪙`,
				custom_id: `market_buy_${item.id}`
			}
		});

		if (i !== pageItems.length - 1) {
			container.components.push({ type: V2.Separator });
		}
	}

	return container;
}

async function resolveTargetChannel(client: Client, channel?: TextChannel) {
	if (channel) return channel;

	const botMsg = await prisma.botMessage.findUnique({ where: { type: "market_embed" } });
	if (!botMsg) return null;

	const fetchedChannel = await client.channels.fetch(botMsg.channelId).catch(() => null);
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

export async function updateMarket(client: Client, channel?: TextChannel, forceRepost = false) {
	const targetChannel = await resolveTargetChannel(client, channel);
	if (!targetChannel) return;

	const items = await prisma.market.findMany({ orderBy: { id: "asc" } });
	const container = buildMarketV2(items as any);

	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components: [container] };
	const payloadEdit: any = { components: [container] };

	const botMsg = await prisma.botMessage.findUnique({ where: { type: "market_embed" } });

	if (forceRepost) {
		if (botMsg && botMsg.channelId === targetChannel.id) {
			await safeDeleteMessage(targetChannel, botMsg.messageId);
		}

		const newMsg = await targetChannel.send(payloadSend);

		await prisma.botMessage.upsert({
			where: { type: "market_embed" },
			update: { messageId: newMsg.id, channelId: targetChannel.id },
			create: { type: "market_embed", messageId: newMsg.id, channelId: targetChannel.id }
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
		where: { type: "market_embed" },
		update: { messageId: newMsg.id, channelId: targetChannel.id },
		create: { type: "market_embed", messageId: newMsg.id, channelId: targetChannel.id }
	});
}
