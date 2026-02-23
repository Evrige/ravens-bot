import { prisma } from "../utils/prisma";
import { EmbedBuilder } from "discord.js";
import {client} from "../index";

export async function startRecruitStatsUpdater() {
	const data = await prisma.botMessage.findUnique({ where: { type: "recruit_stats" } });
	if (!data) return;

	const channel = await client.channels.fetch(data.channelId).catch(() => null);
	if (!channel?.isTextBased()) return;

	const message = await channel.messages.fetch(data.messageId).catch(() => null);
	if (!message) return;

	const generateEmbed = async () => {
		const applications = await prisma.application.findMany({
			where: { recruitId: { not: null } },
			select: { recruitId: true, isAccepted: true }
		});

		const counts: Record<string, { accepted: number; total: number }> = {};
		applications.forEach(a => {
			if (!a.recruitId) return;
			if (!counts[a.recruitId]) counts[a.recruitId] = { accepted: 0, total: 0 };
			counts[a.recruitId].total += 1;
			if (a.isAccepted) counts[a.recruitId].accepted += 1;
		});

		const stats = Object.entries(counts)
			.sort((a, b) => b[1].accepted - a[1].accepted)
			.slice(0, 50);

		const description = stats.length
			? stats.map(([id, c]) => `<@${id}> — Принято заявок: ${c.accepted}, Отклонено: ${c.total - c.accepted}. Всего: ${c.total}`).join("\n")
			: "Пока нет заявок.";

		return new EmbedBuilder()
			.setTitle("📊 Статистика рекрутеров")
			.setColor("Blue")
			.setDescription(description)
			.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
			.setTimestamp();
	};

	const update = async () => {
		const embed = await generateEmbed();
		await message.edit({ embeds: [embed] }).catch(() => {});
	};

	// Сразу обновляем
	await update();

	// 🔄 Запускаем интервал на 4 часа
	setInterval(update, 4 * 60 * 60 * 1000);
}