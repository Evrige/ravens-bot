import { TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import {buildHivePanelMessage} from "../handlers/application/detectives/buildHivePanel";

const TYPE = "hive_panel";

export async function upsertHivePanelInChannel(channel: TextChannel) {
	const payload = await buildHivePanelMessage();

	const stored = await prisma.botMessage.findUnique({
		where: { type: TYPE },
	});

	if (stored) {
		try {
			const ch = await channel.client.channels.fetch(stored.channelId).catch(() => null);
			if (ch && ch.isTextBased()) {
				const msg = await (ch as TextChannel).messages.fetch(stored.messageId);
				await msg.edit(payload);
				return { ok: true, mode: "edited" as const, messageId: msg.id };
			}
		} catch {
			// если удалили сообщение/канал — пересоздадим ниже
		}
	}

	const msg = await channel.send(payload);

	await prisma.botMessage.upsert({
		where: { type: TYPE },
		update: { channelId: msg.channel.id, messageId: msg.id },
		create: { type: TYPE, channelId: msg.channel.id, messageId: msg.id },
	});

	return { ok: true, mode: "created" as const, messageId: msg.id };
}

export async function resetHivePanel(client: any) {
	const stored = await prisma.botMessage.findUnique({
		where: { type: TYPE },
	});
	if (!stored) return { ok: false, reason: "panel_not_found" as const };

	const ch = await client.channels.fetch(stored.channelId).catch(() => null);
	if (!ch || !ch.isTextBased()) return { ok: false, reason: "channel_not_found" as const };

	const channel = ch as TextChannel;
	const msg = await channel.messages.fetch(stored.messageId).catch(() => null);
	if (!msg) return { ok: false, reason: "message_not_found" as const };

	const payload = await buildHivePanelMessage();
	await msg.edit(payload).catch(() => {});

	return { ok: true };
}