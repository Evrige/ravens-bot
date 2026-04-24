import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { getMarketSettings } from "../utils/marketSettingsStore";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;
const BOT_MESSAGE_TYPE = "market_admin_panel";

function buildAdminPanel(
	items: Array<{ id: bigint; name: string; price: unknown }>,
	isOpen: boolean
) {
	const components: any[] = [
		{ type: V2.TextDisplay, content: "## — • Управление магазином" },
		{
			type: V2.TextDisplay,
			content: `• Состояние: **${isOpen ? "Открыт" : "Закрыт"}**`,
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: [
				"**Кнопки:**",
				"• **Открыть/Закрыть магазин** — переключает доступность кнопок покупки.",
				"• **Добавить товар** — создаёт новый товар через модалку.",
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.TextDisplay,
			content: [
				"**Как редактировать товары:**",
				"• У каждого товара ниже есть кнопка **Редактировать**.",
				"• В модалке можно поменять название и цену.",
				"• Если в поле названия написать `DELETE`, товар удалится.",
				"• После сохранения публичная витрина обновляется автоматически.",
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.Section,
			components: [{
				type: V2.TextDisplay,
				content: isOpen ? "Магазин сейчас открыт для покупок." : "Магазин сейчас закрыт для покупателей.",
			}],
			accessory: {
				type: V2.Button,
				style: isOpen ? ButtonStyle.Secondary : ButtonStyle.Success,
				label: isOpen ? "Закрыть магазин" : "Открыть магазин",
				custom_id: CUSTOM_IDS.MARKET_TOGGLE_STATE,
			},
		},
		{
			type: V2.Section,
			components: [{ type: V2.TextDisplay, content: "Добавить новый товар в список магазина." }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Primary,
				label: "Добавить товар",
				custom_id: CUSTOM_IDS.MARKET_MANAGE_ADD,
			},
		},
	];

	if (!items.length) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Товары\nПока что товаров нет." },
		);
		return { type: V2.Container, components };
	}

	components.push({ type: V2.Separator }, { type: V2.TextDisplay, content: "### Товары" });

	for (let i = 0; i < items.length; i++) {
		const item = items[i];

		components.push({
			type: V2.Section,
			components: [{
				type: V2.TextDisplay,
				content: `**#${item.id.toString()} • ${item.name}**\nЦена: **${Number(item.price).toLocaleString("ru-RU")}** 🪙`,
			}],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Secondary,
				label: "Редактировать",
				custom_id: `${CUSTOM_IDS.MARKET_MANAGE_EDIT_ITEM}${item.id.toString()}`,
			},
		});

		if (i !== items.length - 1) {
			components.push({ type: V2.Separator });
		}
	}

	return { type: V2.Container, components };
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FAMILY_MARKET_PANEL) {
		console.warn("[market-admin] FAMILY_MARKET_PANEL_CHANNEL_ID is not set");
		return null;
	}

	const fetchedChannel = await client.channels.fetch(CHANNEL_IDS.FAMILY_MARKET_PANEL).catch((error) => {
		console.warn("[market-admin] failed to fetch FAMILY_MARKET_PANEL channel:", error);
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
		if (err?.code !== 10008) console.warn("market admin delete failed:", err);
	}
}

export async function upsertMarketAdminPanel(client: Client, forceRepost = false) {
	const targetChannel = await resolveTargetChannel(client);
	if (!targetChannel) return;

	const [items, settings] = await Promise.all([
		prisma.market.findMany({ orderBy: { id: "asc" } }),
		getMarketSettings(),
	]);
	const container = buildAdminPanel(items as any, settings.isOpen);

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
			create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: targetChannel.id },
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
				console.warn("market admin edit failed, recreating:", err);
			}
		}
	}

	const newMsg = await targetChannel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { messageId: newMsg.id, channelId: targetChannel.id },
		create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: targetChannel.id },
	});
}
