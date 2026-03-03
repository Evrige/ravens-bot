import { Client, TextChannel, MessageFlags } from "discord.js";
import { prisma } from "../utils/prisma";
import {config} from "../config/env";

const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;

function chunkLines(lines: string[], size = 15) {
	const chunks: string[][] = [];
	for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size));
	return chunks;
}

function buildHiveStatsV2(lines: string[]) {
	const container: any = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## 📊 Статистика улик:" },
			{ type: V2.Separator }
		]
	};

	if (!lines.length) {
		container.components.push({
			type: V2.TextDisplay,
			content: "Нет активных агентов за последние 14 дней."
		});
		return container;
	}

	for (const part of chunkLines(lines)) {
		container.components.push({ type: V2.TextDisplay, content: part.join("\n") });
		container.components.push({ type: V2.Separator });
	}

	container.components.pop();
	return container;
}

async function safeDelete(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) console.warn("hiveStats delete failed:", err);
	}
}

/**
 * Можно вызывать:
 *  - updateHiveStats(client)                       -> канал берётся из BotMessage(type="hive_stats")
 *  - updateHiveStats(client, channel)              -> обновить в конкретном канале
 *  - updateHiveStats(client, channel, true)        -> форс-репост в конкретном канале
 */
export async function updateHiveStats(
	client: Client,
	channel?: TextChannel,
	forceRepost = false
) {
	// ✅ если канал не передали — берём из БД (как авто-апдейтер)
	if (!channel) {
		const botMsg = await prisma.botMessage.findUnique({ where: { type: "hive_stats" } });
		if (!botMsg) return;

		const ch = await client.channels.fetch(botMsg.channelId).catch(() => null);
		if (!ch || !ch.isTextBased()) return;

		channel = ch as TextChannel;
	}

	const guild = channel.guild;

	await guild.members.fetch().catch(() => {});

	const agentMembers = guild.members.cache.filter(m =>
		m.roles.cache.some(r => config.DB_AGENT_ROLE_IDS.includes(r.id))
	);

	const agentIds = [...agentMembers.keys()];

	const now = new Date();
	const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

	const totals = await prisma.hive.groupBy({
		by: ["userId"],
		where: { userId: { in: agentIds } },
		_count: { _all: true },
		_max: { createdAt: true }
	});

	const weeks = await prisma.hive.groupBy({
		by: ["userId"],
		where: { userId: { in: agentIds }, createdAt: { gte: weekAgo } },
		_count: { _all: true }
	});

	const weekMap = new Map<string, number>();
	for (const w of weeks) weekMap.set(w.userId, w._count._all);

	const rows = totals
		.map(t => ({
			userId: t.userId,
			total: t._count._all,
			week: weekMap.get(t.userId) ?? 0,
			last: t._max.createdAt
		}))
		.filter(r => r.last && r.last >= twoWeeksAgo)
		.sort((a, b) => (b.week - a.week) || (b.total - a.total));

	const lines = rows.map(r => `<@${r.userId}>: Всего **${r.total}** • За неделю: **${r.week}**`);

	const container = buildHiveStatsV2(lines);

	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	};

	const payloadEdit: any = {
		components: [container]
	};

	const botMsg = await prisma.botMessage.findUnique({ where: { type: "hive_stats" } });

	// ✅ форс-репост (обычно только из команды)
	if (forceRepost) {
		if (botMsg && botMsg.channelId === channel.id) {
			await safeDelete(channel, botMsg.messageId);
		}

		const newMsg = await channel.send(payloadSend);

		if (botMsg) {
			await prisma.botMessage.update({
				where: { type: "hive_stats" },
				data: { messageId: newMsg.id, channelId: channel.id }
			});
		} else {
			await prisma.botMessage.create({
				data: { type: "hive_stats", messageId: newMsg.id, channelId: channel.id }
			});
		}
		return;
	}

	// ✅ обычный режим: edit -> fallback recreate
	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			if (err?.code !== 10008) console.warn("hiveStats edit failed, recreating:", err);
		}
	}

	const newMsg = await channel.send(payloadSend);

	if (botMsg) {
		await prisma.botMessage.update({
			where: { type: "hive_stats" },
			data: { messageId: newMsg.id, channelId: channel.id }
		});
	} else {
		await prisma.botMessage.create({
			data: { type: "hive_stats", messageId: newMsg.id, channelId: channel.id }
		});
	}
}