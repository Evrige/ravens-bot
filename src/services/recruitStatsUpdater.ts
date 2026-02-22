import { EmbedBuilder, TextChannel, Client } from "discord.js";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";

let statsMessageId: string | null = null;

export function startRecruitStatsUpdater(client: Client) {
	const updateInterval = 30 * 1000; // 30 секунд, для теста

	const updateStats = async () => {
		try {
			const channel = await client.channels.fetch(config.FAMILY_RECRUIT_STATS_CHANNEL_ID) as TextChannel;
			if (!channel) return;

			// Получаем все заявки с рекрутами
			const applications = await prisma.application.findMany({
				where: { recruitId: { not: null } },
				select: { recruitId: true, isAccepted: true }
			});

			// Подсчёт по рекрутерам
			const counts: Record<string, { accepted: number; total: number }> = {};
			applications.forEach(a => {
				if (!a.recruitId) return;
				if (!counts[a.recruitId]) counts[a.recruitId] = { accepted: 0, total: 0 };
				counts[a.recruitId].total += 1;
				if (a.isAccepted) counts[a.recruitId].accepted += 1;
			});

			// Сортировка по принятым заявкам
			const sortedStats = Object.entries(counts)
				.sort((a, b) => b[1].accepted - a[1].accepted)
				.slice(0, 50);

			const description = sortedStats.length
				? sortedStats.map(([id, c]) => `<@${id}> — Принято заявок: ${c.accepted}, Всего: ${c.total}`).join("\n")
				: "Пока нет заявок.";

			const embed = new EmbedBuilder()
				.setTitle("📊 Статистика рекрутеров")
				.setColor("Blue")
				.setDescription(description)
				.setFooter({ text: "Автообновление каждые 30 секунд • by Evri" })
				.setTimestamp();

			// --- Если statsMessageId известен, пробуем редактировать
			if (statsMessageId) {
				const msg = await channel.messages.fetch(statsMessageId).catch(() => null);
				if (msg) {
					await msg.edit({ embeds: [embed] });
					return;
				} else {
					// Если сообщение удалено, сбрасываем id
					statsMessageId = null;
				}
			}

			// --- Ищем существующее сообщение с embed от бота
			if (!statsMessageId) {
				const messages = await channel.messages.fetch({ limit: 50 });
				const embedMsg = messages.find(m => m.author.id === client.user?.id && m.embeds.length > 0);
				if (embedMsg) statsMessageId = embedMsg.id;
				else {
					// --- Если нет старого сообщения, создаём новое
					const msg = await channel.send({ embeds: [embed] });
					statsMessageId = msg.id;
				}
			}
		} catch (err) {
			console.error("Ошибка обновления статистики:", err);
		}
	};

	// Первый запуск
	updateStats();

	// Запуск по интервалу
	setInterval(updateStats, updateInterval);
}