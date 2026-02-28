import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { prisma } from "../utils/prisma";
import {config} from "../config/env";

export async function updateMarket(client: Client) {
	const guild = client.guilds.cache.get(config.FAMILY_SERVER_GUID!);
	if (!guild) return;

	const channelId = config.FAMILY_MARKET_CHANNEL_ID!;
	const channel = guild.channels.cache.get(channelId) as TextChannel;
	if (!channel) return;

	const items = await prisma.market.findMany();

	// Создаём Embed
	const embed = new EmbedBuilder()
		.setTitle("🛒 Магазин")
		.setDescription("Доступные товары:")
		.setColor("#9146FF")
		.addFields(items.map(item => ({
			name: `${item.name} — ${item.price} монет`,
			value: "\u200b",
			inline: false
		})))
		.setTimestamp();
	// Кнопки для каждого товара
	const rows = items.map(item =>
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`market_buy_${item.id}`)
				.setLabel(`Купить ${item.name}`)
				.setStyle(ButtonStyle.Primary)
		)
	);

	// Проверяем, есть ли уже сообщение в базе
	const botMsg = await prisma.botMessage.findUnique({ where: { type: "market_embed" } });

	if (botMsg) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit({ embeds: [embed], components: rows });
			console.log("✅ Сообщение маркета обновлено");
		} catch (err) {
			console.warn("⚠ Не удалось найти старое сообщение, отправляем новое");
			const msg = await channel.send({ embeds: [embed], components: rows });
			await prisma.botMessage.update({
				where: { type: "market_embed" },
				data: { messageId: msg.id, channelId: channel.id }
			});
		}
	} else {
		const msg = await channel.send({ embeds: [embed], components: rows });
		await prisma.botMessage.create({
			data: { type: "market_embed", messageId: msg.id, channelId: channel.id }
		});
		console.log("✅ Сообщение маркета создано");
	}
}

export function startMarketUpdater(client: Client) {
	updateMarket(client).catch(console.error); // сразу при старте
	setInterval(() => updateMarket(client).catch(console.error), 12 * 60 * 60 * 1000); // каждые 12 часов
}