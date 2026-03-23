// src/services/upsertFamilyListPanel.ts
import {
	ChannelType,
	Client,
	ForumChannel,
	Message,
	MessageFlags,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";

export const FAMILY_PANEL = {
	THREAD_NAME: "📋 Список семей",
	BOTMSG_TYPE: "family_list_panel",
	MULTI_PREFIX: "family_list_panel_chunk_",

	customId: {
		edit: (orgId: bigint) => `family:list:edit:${orgId.toString()}`,
		freeze: (orgId: bigint) => `family:list:freeze:${orgId.toString()}`,
		del: (orgId: bigint) => `family:list:delete:${orgId.toString()}`,
		editModal: (orgId: bigint) => `family:list:modal_edit:${orgId.toString()}`,
	},
} as const;

const V2 = {
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

const CHUNK_SIZE = 5;

type FamilyOrg = {
	id: bigint;
	name: string;
	isFreeze: boolean;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}

function buildFamiliesChunk(
	orgs: FamilyOrg[],
	chunkIndex: number,
	totalChunks: number
) {
	const title =
		totalChunks > 1
			? `## 👨‍👩‍👧‍👦 Семьи (${chunkIndex + 1}/${totalChunks})`
			: "## 👨‍👩‍👧‍👦 Семьи";

	const container: any = {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content: title,
			},
			{
				type: V2.Separator,
			},
		],
	};

	if (!orgs.length) {
		container.components.push({
			type: V2.TextDisplay,
			content: "Пока нет семей.",
		});

		return [container] as any[];
	}

	for (const org of orgs) {
		container.components.push({
			type: V2.TextDisplay,
			content: org.isFreeze ? `## ❄️ ${org.name}` : `## ${org.name}`,
		});

		container.components.push({
			type: 1, // ActionRow
			components: [
				{
					type: 2,
					style: 2,
					label: "Редактировать",
					custom_id: FAMILY_PANEL.customId.edit(org.id),
				},
				{
					type: 2,
					style: org.isFreeze ? 3 : 2,
					label: org.isFreeze ? "Разморозить" : "Заморозить",
					custom_id: FAMILY_PANEL.customId.freeze(org.id),
				},
				{
					type: 2,
					style: 4,
					label: "Удалить",
					custom_id: FAMILY_PANEL.customId.del(org.id),
				},
			],
		});

		container.components.push({
			type: V2.Separator,
		});
	}

	return [container] as any[];
}

async function getFamilyForum(client: Client): Promise<ForumChannel | null> {
	const forumId = config.DB_FORUM_FAMILY_ID;
	if (!forumId) return null;

	const ch = await client.channels.fetch(forumId).catch(() => null);
	if (!ch || ch.type !== ChannelType.GuildForum) return null;

	return ch as ForumChannel;
}

function pickAppliedTagsIfRequired(forum: ForumChannel): string[] | undefined {
	const tags = (forum as any).availableTags as Array<{ id: string; name: string }> | undefined;
	if (!tags?.length) return undefined;
	return [tags[0].id];
}

async function ensureThread(forum: ForumChannel, storedChannelId?: string) {
	if (storedChannelId) {
		const existing = await forum.client.channels.fetch(storedChannelId).catch(() => null);
		if (existing && existing.isThread()) {
			const th = existing as ThreadChannel;
			if (th.archived) await th.setArchived(false).catch(() => null);
			if (th.locked) await th.setLocked(false).catch(() => null);
			return th;
		}
	}

	const active = await forum.threads.fetchActive().catch(() => null);
	const foundActive = active?.threads?.find((t) => t.name === FAMILY_PANEL.THREAD_NAME);
	if (foundActive) {
		const th = foundActive as ThreadChannel;
		if (th.archived) await th.setArchived(false).catch(() => null);
		if (th.locked) await th.setLocked(false).catch(() => null);
		return th;
	}

	const archived = await forum.threads
		.fetchArchived({ type: "public", fetchAll: true })
		.catch(() => null);

	const foundArchived = archived?.threads?.find((t) => t.name === FAMILY_PANEL.THREAD_NAME);
	if (foundArchived) {
		const th = foundArchived as ThreadChannel;
		await th.setArchived(false).catch(() => null);
		await th.setLocked(false).catch(() => null);
		return th;
	}

	const appliedTags = pickAppliedTagsIfRequired(forum);

	return await forum.threads.create({
		name: FAMILY_PANEL.THREAD_NAME,
		message: { content: "Служебный тред панели семей." },
		...(appliedTags ? { appliedTags } : {}),
	});
}

function getChunkType(index: number) {
	return `${FAMILY_PANEL.MULTI_PREFIX}${index}`;
}

async function getStoredChunkMessages() {
	const rows = await prisma.botMessage.findMany({
		where: {
			OR: [
				{ type: FAMILY_PANEL.BOTMSG_TYPE },
				{ type: { startsWith: FAMILY_PANEL.MULTI_PREFIX } },
			],
		},
		orderBy: { type: "asc" },
	});

	const chunkRows = rows
		.map((row) => {
			if (row.type === FAMILY_PANEL.BOTMSG_TYPE) {
				return {
					index: 0,
					type: row.type,
					messageId: row.messageId,
					channelId: row.channelId,
				};
			}

			const n = Number(row.type.replace(FAMILY_PANEL.MULTI_PREFIX, ""));
			if (Number.isNaN(n)) return null;

			return {
				index: n,
				type: row.type,
				messageId: row.messageId,
				channelId: row.channelId,
			};
		})
		.filter(Boolean)
		.sort((a: any, b: any) => a.index - b.index) as Array<{
		index: number;
		type: string;
		messageId: string;
		channelId: string;
	}>;

	return chunkRows;
}

async function saveChunkMessage(index: number, message: Message, threadId: string) {
	const type = index === 0 ? FAMILY_PANEL.BOTMSG_TYPE : getChunkType(index);

	await prisma.botMessage.upsert({
		where: { type },
		create: {
			type,
			messageId: message.id,
			channelId: threadId,
		},
		update: {
			messageId: message.id,
			channelId: threadId,
		},
	});
}

async function deleteStoredChunk(index: number) {
	const type = index === 0 ? FAMILY_PANEL.BOTMSG_TYPE : getChunkType(index);

	await prisma.botMessage.delete({
		where: { type },
	}).catch(() => null);
}

async function fetchMessageSafe(thread: ThreadChannel, messageId: string) {
	return await thread.messages.fetch(messageId).catch(() => null);
}

async function syncFamilyChunkMessages(thread: ThreadChannel, orgs: FamilyOrg[]) {
	const chunks = chunkArray(orgs, CHUNK_SIZE);
	const finalChunks = chunks.length ? chunks : [[]];

	const stored = await getStoredChunkMessages();

	let edited = 0;
	let created = 0;
	let deleted = 0;

	for (let i = 0; i < finalChunks.length; i++) {
		const components = buildFamiliesChunk(finalChunks[i], i, finalChunks.length) as any;
		const storedRow = stored.find((x) => x.index === i);

		if (storedRow) {
			const existingMsg = await fetchMessageSafe(thread, storedRow.messageId);

			if (existingMsg) {
				await existingMsg.edit({
					flags: MessageFlags.IsComponentsV2,
					components,
				});
				edited++;
				continue;
			}
		}

		const newMsg = await thread.send({
			flags: MessageFlags.IsComponentsV2,
			components,
		});

		await saveChunkMessage(i, newMsg, thread.id);
		created++;
	}

	for (const row of stored) {
		if (row.index < finalChunks.length) continue;

		const msg = await fetchMessageSafe(thread, row.messageId);
		if (msg) {
			await msg.delete().catch(() => null);
		}

		await deleteStoredChunk(row.index);
		deleted++;
	}

	// если почему-то index 0 был не FAMILY_PANEL.BOTMSG_TYPE, а chunk_0 — подчистим
	await prisma.botMessage.deleteMany({
		where: {
			type: getChunkType(0),
		},
	}).catch(() => null);

	// дополнительно гарантируем, что channelId у главной записи актуален
	const firstRow = await prisma.botMessage.findUnique({
		where: { type: FAMILY_PANEL.BOTMSG_TYPE },
	});

	if (firstRow) {
		await prisma.botMessage.update({
			where: { type: FAMILY_PANEL.BOTMSG_TYPE },
			data: { channelId: thread.id },
		}).catch(() => null);
	}

	return {
		edited,
		created,
		deleted,
		total: finalChunks.length,
	};
}

export async function upsertFamilyListPanel(client: Client) {
	try {
		const forum = await getFamilyForum(client);
		if (!forum) {
			return {
				ok: false as const,
				reason: "DB_FORUM_FAMILY_ID not set or not a forum",
			};
		}

		const storedMain = await prisma.botMessage.findUnique({
			where: { type: FAMILY_PANEL.BOTMSG_TYPE },
		});

		const thread = await ensureThread(forum, storedMain?.channelId);

		const orgs = await prisma.organisation.findMany({
			where: { type: "FAMILY" },
			orderBy: [{ isFreeze: "asc" }, { id: "asc" }],
			select: { id: true, name: true, isFreeze: true },
		});

		const syncResult = await syncFamilyChunkMessages(thread, orgs);

		return {
			ok: true as const,
			mode: "edited" as const,
			threadId: thread.id,
			...syncResult,
		};
	} catch (e: any) {
		return {
			ok: false as const,
			reason: e?.message ?? "unknown error",
		};
	}
}