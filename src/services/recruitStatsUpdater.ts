import { prisma } from "../utils/prisma";
import {client} from "../index";
import { config } from "../config/env";
import { buildRecruitStatsEmbed } from "./recruitStats";

export async function startRecruitStatsUpdater() {
	const data = await prisma.botMessage.findUnique({ where: { type: "recruit_stats" } });
	if (!data) return;

	const channel = await client.channels.fetch(data.channelId).catch(() => null);
	if (!channel?.isTextBased()) return;

	const message = await channel.messages.fetch(data.messageId).catch(() => null);
	if (!message) return;

	const update = async () => {
		const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
		if (!guild) return;

		const embed = await buildRecruitStatsEmbed(guild);
		await message.edit({ embeds: [embed] }).catch(() => {});
	};

	// Сразу обновляем
	await update();

	// 🔄 Запускаем интервал на 4 часа
	setInterval(update, 4 * 60 * 60 * 1000);
}
