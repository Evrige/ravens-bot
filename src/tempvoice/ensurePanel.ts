// src/tempvoice/panel.ts
import { ChannelType, Guild, PermissionFlagsBits, TextChannel } from "discord.js";
import { buildPanelEmbed, buildPanelComponents } from "./ui";
import { prisma } from "../utils/prisma";

const BOTMSG_TYPE = "tempvoice_panel";

async function fetchTextChannelSilent(guild: Guild, channelId: string): Promise<TextChannel | null> {
	const ch = await guild.channels.fetch(channelId).catch(() => null);
	if (!ch || ch.type !== ChannelType.GuildText) return null;

	const me = guild.members.me;
	if (me) {
		const perms = ch.permissionsFor(me);
		if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) return null;
	}

	return ch as TextChannel;
}

export async function ensureTempVoicePanel(guild: Guild, fallbackTextChannelId: string) {
	const row = await prisma.botMessage.findUnique({ where: { type: BOTMSG_TYPE } });

	const candidates = [row?.channelId, fallbackTextChannelId].filter(Boolean) as string[];

	let text: TextChannel | null = null;
	let usedChannelId: string | null = null;

	for (const id of candidates) {
		const got = await fetchTextChannelSilent(guild, id);
		if (got) {
			text = got;
			usedChannelId = got.id;
			break;
		}
	}

	// вообще молча выходим
	if (!text || !usedChannelId) return;

	if (row && row.channelId !== usedChannelId) {
		await prisma.botMessage.update({ where: { type: BOTMSG_TYPE }, data: { channelId: usedChannelId } });
	}

	if (row?.messageId) {
		const msg = await text.messages.fetch(row.messageId).catch(() => null);
		if (msg) {
			await msg.edit({ embeds: [buildPanelEmbed()], components: buildPanelComponents() }).catch(() => null);
			return;
		}
	}

	const msg = await text.send({ embeds: [buildPanelEmbed()], components: buildPanelComponents() });

	await prisma.botMessage.upsert({
		where: { type: BOTMSG_TYPE },
		update: { messageId: msg.id, channelId: usedChannelId },
		create: { type: BOTMSG_TYPE, messageId: msg.id, channelId: usedChannelId },
	});
}