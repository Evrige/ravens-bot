import {
	Client,
	TextChannel,
	MessageFlags,
	ButtonStyle,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { CUSTOM_IDS } from "../constants/customIds";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;

// ================= Вспомогательные =================

function pad2(n: number) {
	return String(n).padStart(2, "0");
}

function fmtDate(d: Date) {
	return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function addDays(date: Date, days: number) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfDay(d: Date) {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

async function getPrice(): Promise<number> {
	const row = await prisma.weeklyFeeSettings.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1, price: 50000 }
	});
	return row.price;
}

function buildPanelV2(lines: string[], price: number) {
	const container: any = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## 💸 Недельный взнос" },
			{ type: V2.TextDisplay, content: `Цена: **${price.toLocaleString()}🪙 / неделя**` },
			{ type: V2.Separator },
		]
	};

	if (!lines.length) {
		container.components.push({
			type: V2.TextDisplay,
			content: "*Пока никто не оплатил недельный взнос.*"
		});
	} else {
		container.components.push({
			type: V2.TextDisplay,
			content: lines.join("\n")
		});
	}

	container.components.push(
		{ type: V2.Separator },
		{
			type: V2.Section,
			components: [{ type: V2.TextDisplay, content: "Админ-действия:" }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Secondary,
				label: "Изменить цену",
				custom_id: CUSTOM_IDS.WEEKLY_FEE_PRICE_EDIT
			}
		}
	);

	return container;
}

async function safeDeleteMessage(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) console.warn("weekly fee delete failed:", err);
	}
}

// ================= Основная функция =================

export async function updateWeeklyFeePanel(
	client: Client,
	channel?: TextChannel,
	forceRepost = false
) {
	// если канал не передали — берём из БД
	if (!channel) {
		const botMsg = await prisma.botMessage.findUnique({
			where: { type: "weekly_fee_panel" }
		});
		if (!botMsg) return;

		const ch = await client.channels.fetch(botMsg.channelId).catch(() => null);
		if (!ch || !ch.isTextBased()) return;

		channel = ch as TextChannel;
	}

	const price = await getPrice();
	const today = startOfDay(new Date());

	// 🔥 берём только оплативших
	const payments = await prisma.weeklyFeePayment.findMany();

	const rows = payments.map(p => {
		const weeks = Math.floor(p.totalPaid / price);
		const paidUntil = addDays(startOfDay(p.paidFrom), weeks * 7);

		return {
			userId: p.userId,
			paidUntil
		};
	});

	// сортировка по окончанию оплаты
	rows.sort((a, b) => a.paidUntil.getTime() - b.paidUntil.getTime());

	const lines = rows.map(r => {
		const ok = r.paidUntil.getTime() >= today.getTime();
		return `<@${r.userId}> — оплачено до **${fmtDate(r.paidUntil)}** ${ok ? "✅" : "❌"}`;
	});

	const container = buildPanelV2(lines, price);

	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	};

	const payloadEdit: any = {
		components: [container]
	};

	const botMsg = await prisma.botMessage.findUnique({
		where: { type: "weekly_fee_panel" }
	});

	// ===== force repost =====
	if (forceRepost) {
		if (botMsg && botMsg.channelId === channel.id) {
			await safeDeleteMessage(channel, botMsg.messageId);
		}

		const newMsg = await channel.send(payloadSend);

		if (botMsg) {
			await prisma.botMessage.update({
				where: { type: "weekly_fee_panel" },
				data: { messageId: newMsg.id, channelId: channel.id }
			});
		} else {
			await prisma.botMessage.create({
				data: {
					type: "weekly_fee_panel",
					messageId: newMsg.id,
					channelId: channel.id
				}
			});
		}
		return;
	}

	// ===== обычное обновление =====
	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			if (err?.code !== 10008)
				console.warn("weekly fee edit failed, recreating:", err);
		}
	}

	const newMsg = await channel.send(payloadSend);

	if (botMsg) {
		await prisma.botMessage.update({
			where: { type: "weekly_fee_panel" },
			data: { messageId: newMsg.id, channelId: channel.id }
		});
	} else {
		await prisma.botMessage.create({
			data: {
				type: "weekly_fee_panel",
				messageId: newMsg.id,
				channelId: channel.id
			}
		});
	}
}