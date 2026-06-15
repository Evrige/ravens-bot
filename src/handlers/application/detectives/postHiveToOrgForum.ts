import {
	ChannelType,
	ForumChannel,
	Guild,
	ThreadChannel,
	EmbedBuilder,
	Message,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { prisma } from "../../../utils/prisma";
import { config } from "../../../config/env";
import { CUSTOM_IDS } from "../../../constants/customIds";

function getForumIdByType(type: "FAMILY" | "FRACTION") {
	return type === "FAMILY"
		? config.DB_FORUM_FAMILY_ID
		: config.DB_FORUM_FRACTION_ID;
}

type FormLabel = "1/2" | "1/4" | "1/5";

function formEnumToLabel(form: any): FormLabel {
	if (form === "ONE_HALF" || form === "1/2") return "1/2";
	if (form === "ONE_QUARTER" || form === "1/4") return "1/4";
	return "1/5";
}

function buildSummaryEmbed(
	orgName: string,
	byForm: Record<FormLabel, string[]>
) {
	const buildBlock = (label: FormLabel) => {
		const lines = byForm[label] ?? [];
		const count = lines.length;
		const header = `${count}/${label.split("/")[1]}`;

		if (!count) return `## ${header}\n—`;

		const formatted = lines
			.map((l) => `### ${l}`)
			.join("\n\n")
			.slice(0, 3500);

		return `## ${header}\n\n${formatted}`;
	};

	return new EmbedBuilder()
		.setDescription(
			`# 📌 Улики — ${orgName}\n\n` +
			`${buildBlock("1/2")}\n\n` +
			`${buildBlock("1/4")}\n\n` +
			`${buildBlock("1/5")}`
		)
		.setFooter({ text: "by Evri" })
		.setTimestamp();
}

async function findOrCreateSummaryMessage(
	thread: ThreadChannel,
	orgName: string
) {
	const pinned = await thread.messages.fetchPinned().catch(() => null);
	if (pinned) {
		const foundPinned = pinned.find((m: Message) => {
			if (!m.author?.bot) return false;
			const e = m.embeds?.[0];
			return !!e && (e.description || "").startsWith("# 📌 Улики — ");
		});
		if (foundPinned) return foundPinned;
	}

	const msgs = await thread.messages.fetch({ limit: 100 }).catch(() => null);
	if (msgs) {
		const found = msgs.find((m: Message) => {
			if (!m.author?.bot) return false;
			const e = m.embeds?.[0];
			return !!e && (e.description || "").startsWith("# 📌 Улики — ");
		});
		if (found) return found;
	}

	const embed = buildSummaryEmbed(orgName, {
		"1/2": [],
		"1/4": [],
		"1/5": [],
	});

	const msg = await thread.send({ embeds: [embed] });
	await msg.pin().catch(() => {});
	return msg;
}

async function ensureOrgThread(guild: Guild, org: any) {
	if (org.channelId) {
		const ch = await guild.channels.fetch(org.channelId).catch(() => null);
		if (ch && ch.isThread()) {
			const thread = ch as ThreadChannel;
			if (thread.archived)
				await thread.setArchived(false).catch(() => {});
			return thread;
		}
	}

	const forumId = getForumIdByType(org.type as any);
	if (!forumId) return null;

	const forumCh = await guild.channels.fetch(forumId).catch(() => null);
	if (!forumCh || forumCh.type !== ChannelType.GuildForum) return null;

	const forum = forumCh as ForumChannel;

	const created = await forum.threads.create({
		name: `🏛️ ${org.name}`,
		message: {
			content: `Канал организации **${org.name}**.`,
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
	hiveIdStr: string;
}) {
	const { guild, hiveIdStr } = opts;

	const hive = await prisma.hive.findUnique({
		where: { id: BigInt(hiveIdStr) },
		include: { organisation: true },
	});

	if (!hive || !hive.organisation)
		return { ok: false, reason: "Hive/Org not found" as const };

	return refreshOrgHiveForum(opts.guild, hive.organisation.id);
}

export async function refreshOrgHiveForum(guild: Guild, orgId: bigint) {
	const org = await prisma.organisation.findUnique({
		where: { id: orgId },
	});

	if (!org) return { ok: false, reason: "Hive/Org not found" as const };

	const thread = await ensureOrgThread(guild, org);
	if (!thread) return { ok: false, reason: "Forum/Thread not found" as const };

	const summaryMsg = await findOrCreateSummaryMessage(
		thread,
		org.name
	);

	const hives = await prisma.hive.findMany({
		where: {
			organisationId: org.id,
			status: "ACCEPTED",
			isUsed: false
		},
		orderBy: { id: "asc" },
		select: { id: true, form: true, logUrl: true },
	});

	const byForm: Record<FormLabel, string[]> = {
		"1/2": [],
		"1/4": [],
		"1/5": [],
	};

	for (const h of hives) {
		const formLabel = formEnumToLabel(h.form);
		if (!h.logUrl) continue;
		byForm[formLabel].push(`${h.id} - ${h.logUrl}`);
	}

	const embed = buildSummaryEmbed(org.name, byForm);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.CREATE_CASE}${org.id}`)
			.setLabel("📄 Сформировать кейс")
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.DELETE_HIVE_FROM_FORUM}${org.id}`)
			.setLabel("🗑️ Удалить улику")
			.setStyle(ButtonStyle.Danger)
	);

	await summaryMsg.edit({
		embeds: [embed],
		components: [row],
	});

	return { ok: true };
}

export async function refreshExistingHiveForumSummaries(client: any) {
	const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
	if (!guild) return { ok: false, reason: "Guild not found" as const };

	const organisations = await prisma.organisation.findMany({
		where: {
			channelId: { not: null },
		},
		select: { id: true },
	});

	let updated = 0;
	for (const org of organisations) {
		const result = await refreshOrgHiveForum(guild, org.id).catch(() => null);
		if (result?.ok) updated += 1;
	}

	return { ok: true, updated };
}
