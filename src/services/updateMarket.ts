import { Client, TextChannel, ButtonStyle, MessageFlags } from "discord.js";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;

function buildMarketV2(items: Array<{ id: bigint; name: string; price: any }>) {
	const pageItems = items.slice(0, 5);

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
			components: [{ type: V2.TextDisplay, content: `🏷️  **${item.name}**` }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				// хочешь с монеткой на кнопке — оставляем
				label: `${Number(item.price).toLocaleString()}🪙`,
				custom_id: `market_buy_${item.id}`
			}
		});

		if (i !== pageItems.length - 1) container.components.push({ type: V2.Separator });
	}

	container.components.push(
		{ type: V2.Separator },
		{ type: V2.TextDisplay, content: `*Страница 1/1 • Показано: ${pageItems.length} • Всего: ${items.length}*` }
	);

	return container;
}

export async function updateMarket(client: Client) {
	const guild = client.guilds.cache.get(config.FAMILY_SERVER_GUID!);
	if (!guild) return;

	const channel = guild.channels.cache.get(config.FAMILY_MARKET_CHANNEL_ID!) as TextChannel;
	if (!channel) return;

	const items = await prisma.market.findMany({ orderBy: { id: "asc" } });
	const container = buildMarketV2(items as any);

	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components: [container] };
	const payloadEdit: any = { components: [container] };

	const botMsg = await prisma.botMessage.findUnique({ where: { type: "market_embed" } });

	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			// 10008 = сообщение удалили -> пересоздаём молча
			if (err?.code !== 10008) {
				console.warn("market edit failed, recreating:", err);
			}
		}
	}

	// пересоздаём
	const newMsg = await channel.send(payloadSend);

	if (botMsg) {
		await prisma.botMessage.update({
			where: { type: "market_embed" },
			data: { messageId: newMsg.id, channelId: channel.id }
		});
	} else {
		await prisma.botMessage.create({
			data: { type: "market_embed", messageId: newMsg.id, channelId: channel.id }
		});
	}
}
