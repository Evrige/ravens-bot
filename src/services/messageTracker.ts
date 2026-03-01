import { prisma } from "../utils/prisma";
import { xpForNextLevel } from "../utils/xpForNextLevel";

const XP_PER_MESSAGE = 1;
const COOLDOWN_MS = 10_000; // антиспам: 1 раз в 10 сек
const msgCd = new Map<string, number>(); // userId -> lastGain

export function initMessageTracker(client: any) {
	client.on("messageCreate", async (message: any) => {
		if (!message.guild) return;
		if (message.author?.bot) return;

		const userId = message.author.id;

		// антиспам XP
		const now = Date.now();
		const last = msgCd.get(userId) ?? 0;
		if (now - last < COOLDOWN_MS) {
			// но сообщения всё равно считаем
			await prisma.user.upsert({
				where: { id: userId },
				update: { messageCount: { increment: 1n } },
				create: { id: userId, messageCount: 1n }
			});
			return;
		}
		msgCd.set(userId, now);

		// обновляем счётчики + XP
		const updated = await prisma.user.upsert({
			where: { id: userId },
			update: {
				messageCount: { increment: 1n },
				xp: { increment: BigInt(XP_PER_MESSAGE) }
			},
			create: {
				id: userId,
				messageCount: 1n,
				xp: BigInt(XP_PER_MESSAGE),
				level: 0
			}
		});

		// левелап
		let level = updated.level;
		let xp = Number(updated.xp ?? 0n);
		let need = xpForNextLevel(level);

		let leveledUp = false;
		while (xp >= need) {
			xp -= need;
			level += 1;
			need = xpForNextLevel(level);
			leveledUp = true;
		}

		if (leveledUp) {
			await prisma.user.update({
				where: { id: userId },
				data: { level, xp: BigInt(xp) }
			});

			if (message.channel?.isTextBased?.()) {
				await message.channel.send(`${message.author} апнул **${level}** уровень!`);
			}
		}
	});
}