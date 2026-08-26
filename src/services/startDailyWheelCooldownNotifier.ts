import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	EmbedBuilder,
} from "discord.js";
import { config } from "../config/env";
import { prisma } from "../utils/prisma";

const CHECK_INTERVAL_MS = 60_000;
const BATCH_SIZE = 25;

function buildCooldownReadyEmbed() {
	const wheelLink = config.DAILY_WHEEL_CHANNEL_ID
		? `https://discord.com/channels/${config.FAMILY_SERVER_GUID}/${config.DAILY_WHEEL_CHANNEL_ID}`
		: null;

	return new EmbedBuilder()
		.setColor(0xa855f7)
		.setTitle("🎡 Колесо Londo снова доступно")
		.setDescription(
			[
				"Ваш ежедневный таймер восстановился.",
				"Можно снова испытать удачу и прокрутить колесо.",
				wheelLink ? "" : null,
				wheelLink ? `[Перейти к колесу](${wheelLink})` : null,
			].join("\n")
		)
		.setTimestamp();
}

function buildWheelLinkComponents() {
	if (!config.DAILY_WHEEL_CHANNEL_ID) return [];

	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Link)
				.setLabel("Перейти к колесу")
				.setURL(
					`https://discord.com/channels/${config.FAMILY_SERVER_GUID}/${config.DAILY_WHEEL_CHANNEL_ID}`
				)
		),
	];
}

async function notifyExpiredCooldowns(client: Client) {
	const expired = await prisma.dailyWheelCooldown.findMany({
		where: {
			nextSpinAt: { lte: new Date() },
		},
		orderBy: { nextSpinAt: "asc" },
		take: BATCH_SIZE,
	});

	for (const cooldown of expired) {
		const deleted = await prisma.dailyWheelCooldown.deleteMany({
			where: {
				userId: cooldown.userId,
				nextSpinAt: { lte: new Date() },
			},
		});

		if (!deleted.count) continue;

		const user = await client.users.fetch(cooldown.userId).catch(() => null);
		if (!user) continue;

		await user.send({
			embeds: [buildCooldownReadyEmbed()],
			components: buildWheelLinkComponents(),
		}).catch((error) => {
			console.error("[daily-wheel] cooldown DM failed:", error);
		});
	}
}

export function startDailyWheelCooldownNotifier(client: Client) {
	let running = false;

	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await notifyExpiredCooldowns(client);
		} catch (error) {
			console.error("[daily-wheel] cooldown notifier failed:", error);
		} finally {
			running = false;
		}
	};

	void tick();
	const interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
	interval.unref?.();
}
