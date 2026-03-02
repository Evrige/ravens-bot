// src/commands/detectives/db/postHiveToOrgForum.ts
import {
	ChannelType,
	ForumChannel,
	Guild,
	ThreadChannel,
	EmbedBuilder,
	Message,
} from "discord.js";
import { prisma } from "../../../utils/prisma";
import { config } from "../../../config/env";

function getForumIdByType(type: "FAMILY" | "FRACTION") {
	return type === "FAMILY" ? config.DB_FORUM_FAMILY_ID : config.DB_FORUM_FRACTION_ID;
}

type FormLabel = "1/2" | "1/4" | "1/5";

function formEnumToLabel(form: any): FormLabel {
	if (form === "ONE_HALF" || form === "1/2") return "1/2";
	if (form === "ONE_QUARTER" || form === "1/4") return "1/4";
	return "1/5";
}

function buildSummaryEmbed(
	orgName: string,
	byForm: Record<"1/2" | "1/4" | "1/5", string[]>
) {
	const buildBlock = (label: "1/2" | "1/4" | "1/5") => {
		const lines = byForm[label] ?? [];
		const count = lines.length;

		// делаем заголовок вида "3/2", "11/4", "2/5"
		const header = `${count}/${label.split("/")[1]}`;

		if (!count) {
			return `## ${header}\n—`;
		}

		const formatted = lines
			.map(l => `### ${l}`)
			.join("\n\n")
			.slice(0, 3500); // запас до лимита 4096

		return `## ${header}\n\n${formatted}`;
	};

	return new EmbedBuilder()
		.setTitle(`📌 Улики — ${orgName}`)
		.setDescription(
			`${buildBlock("1/2")}\n\n` +
			`${buildBlock("1/4")}\n\n` +
			`${buildBlock("1/5")}`
		)
		.setFooter({ text: "by Evri" })
		.setTimestamp();
}

async function findOrCreateSummaryMessage(thread: ThreadChannel, orgName: string) {
	// 1) pinned
	const pinned = await thread.messages.fetchPinned().catch(() => null);
	if (pinned) {
		const foundPinned = pinned.find((m: Message) => {
			if (!m.author?.bot) return false;
			const e = m.embeds?.[0];
			return !!e && (e.title || "").startsWith("📌 Улики — ");
		});
		if (foundPinned) return foundPinned;
	}

	// 2) last 100
	const msgs = await thread.messages.fetch({ limit: 100 }).catch(() => null);
	if (msgs) {
		const found = msgs.find((m: Message) => {
			if (!m.author?.bot) return false;
			const e = m.embeds?.[0];
			return !!e && (e.title || "").startsWith("📌 Улики — ");
		});
		if (found) return found;
	}

	// 3) create + pin
	const embed = buildSummaryEmbed(orgName, { "1/2": [], "1/4": [], "1/5": [] });
	const msg = await thread.send({ embeds: [embed] });
	await msg.pin().catch(() => {});
	return msg;
}

async function ensureOrgThread(guild: Guild, org: any) {
	// 1) existing thread
	if (org.channelId) {
		const ch = await guild.channels.fetch(org.channelId).catch(() => null);
		if (ch && ch.isThread()) {
			const thread = ch as ThreadChannel;
			if (thread.archived) await thread.setArchived(false).catch(() => {});
			return thread;
		}
	}

	// 2) create new thread in forum
	const forumId = getForumIdByType(org.type as any);
	if (!forumId) return null;

	const forumCh = await guild.channels.fetch(forumId).catch(() => null);
	if (!forumCh || forumCh.type !== ChannelType.GuildForum) return null;

	const forum = forumCh as ForumChannel;

	const created = await forum.threads.create({
		name: `🏛️ ${org.name}`,
		message: {
			content: `Канал организации **${org.name}**. Сюда попадают принятые улики (в сводку).`,
		},
	});

	await prisma.organisation.update({
		where: { id: org.id },
		data: { channelId: created.id },
	});

	return created;
}

export async function postHiveToForum(opts: {
	guild: Guild;
	hiveIdStr: string; // можно не использовать, но оставим
}) {
	const { guild, hiveIdStr } = opts;

	const hive = await prisma.hive.findUnique({
		where: { id: BigInt(hiveIdStr) },
		include: { organisation: true },
	});

	if (!hive) return { ok: false, reason: "Hive not found" as const };
	if (!hive.organisation) return { ok: false, reason: "Organisation not found" as const };

	const org = hive.organisation;

	const thread = await ensureOrgThread(guild, org);
	if (!thread) return { ok: false, reason: "Forum/Thread not found" as const };

	// ✅ нашли/создали 1 сводку
	const summaryMsg = await findOrCreateSummaryMessage(thread, org.name);

	// ✅ ПЕРЕСОБИРАЕМ СВОДКУ ИЗ БД (все улики)
	const hives = await prisma.hive.findMany({
		where: {
			organisationId: org.id,
			status: "ACCEPTED",
			// логUrl должен быть, иначе строка будет без ссылки
		},
		orderBy: { id: "asc" },
		select: { id: true, form: true, logUrl: true },
	});

	const byForm: Record<FormLabel, string[]> = { "1/2": [], "1/4": [], "1/5": [] };

	for (const h of hives) {
		const formLabel = formEnumToLabel(h.form);
		const url = (h.logUrl || "").trim();
		if (!url) continue;
		byForm[formLabel].push(`${h.id.toString()} - ${url}`);
	}

	const embed = buildSummaryEmbed(org.name, byForm);
	await summaryMsg.edit({ embeds: [embed] }).catch(() => {});

	return { ok: true, mode: "rebuilt" as const };
}