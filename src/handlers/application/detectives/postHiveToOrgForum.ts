import { ChannelType, ForumChannel, Guild, ThreadChannel } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { config } from "../../../config/env";

function getForumIdByType(type: "FAMILY" | "FRACTION") {
	return type === "FAMILY" ? config.DB_FORUM_FAMILY_ID : config.DB_FORUM_FRACTION_ID;
}

export async function postHiveToForum(opts: {
	guild: Guild;
	hiveIdStr: string;
	embed: any;
}) {
	const { guild, hiveIdStr, embed } = opts;

	const hive = await prisma.hive.findUnique({
		where: { id: BigInt(hiveIdStr) },
		include: { organisation: true },
	});

	if (!hive) return { ok: false, reason: "Hive not found" };
	if (!hive.organisation) return { ok: false, reason: "Organisation not found" };

	const org = hive.organisation;

	// 1) если у организации уже есть threadId (channelId) — пишем туда
	if (org.channelId) {
		const ch = await guild.channels.fetch(org.channelId).catch(() => null);

		if (ch && ch.isThread()) {
			const thread = ch as ThreadChannel;

			// если тред заархивирован — открываем
			if (thread.archived) {
				await thread.setArchived(false, "Posting accepted hive").catch(() => {});
			}

			await thread.send({
				content: `🧩 **Улика #${hiveIdStr}**`,
				embeds: [embed],
			});

			return { ok: true, mode: "sent_to_org_thread" as const };
		}

		// если channelId есть, но тред не найден/удалён — восстановим ниже
	}

	// 2) восстановление: создаём тред организации в правильном форуме и сохраняем channelId
	const forumId = getForumIdByType(org.type as any);
	if (!forumId) return { ok: false, reason: "Forum ID not set in env" };

	const forumCh = await guild.channels.fetch(forumId).catch(() => null);
	if (!forumCh || forumCh.type !== ChannelType.GuildForum) {
		return { ok: false, reason: "Forum channel not found" };
	}

	const forum = forumCh as ForumChannel;

	const orgThread = await forum.threads.create({
		name: `🏛️ ${org.name}`,
		message: {
			content: `Канал организации **${org.name}** (восстановлен). Сюда будут попадать принятые улики.`,
		},
	});

	await prisma.organisation.update({
		where: { id: org.id },
		data: { channelId: orgThread.id },
	});

	await orgThread.send({
		content: `🧩 **Улика #${hiveIdStr}**`,
		embeds: [embed],
	});

	return { ok: true, mode: "repaired_and_sent" as const };
}