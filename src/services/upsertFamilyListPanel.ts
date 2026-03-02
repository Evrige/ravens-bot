import {
	ChannelType,
	Client,
	ForumChannel,
	MessageFlags,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";

export const FAMILY_PANEL = {
	THREAD_NAME: "📋 Список семей",
	BOTMSG_TYPE: "family_list_panel",
	CID_PREFIX: "family:list",

	customId: {
		edit: (orgId: bigint) => `family:list:edit:${orgId.toString()}`,
		freeze: (orgId: bigint) => `family:list:freeze:${orgId.toString()}`,
		del: (orgId: bigint) => `family:list:delete:${orgId.toString()}`,
		editModal: (orgId: bigint) => `family:list:modal_edit:${orgId.toString()}`,
	},
} as const;

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

function safeNameLabel(name: string) {
	// у кнопки лимит label 80
	const trimmed = (name || "").trim();
	return trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed || "Без названия";
}


function buildFamiliesPanelV2Rows(
	orgs: Array<{ id: bigint; name: string; isFreeze: boolean }>
) {
	const perPage = 12; // одна семья = TextDisplay + ActionRow + Separator -> не делай слишком много
	const pages = chunk(orgs, perPage);

	const containers: any[] = [];

	const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;

	for (let p = 0; p < pages.length; p++) {
		const page = pages[p];

		const container: any = {
			type: V2.Container,
			components: [
				{
					type: V2.TextDisplay,
					content:
						pages.length > 1
							? `## 👨‍👩‍👧‍👦 Семьи (стр. ${p + 1}/${pages.length})`
							: "## 👨‍👩‍👧‍👦 Семьи",
				},
				{ type: V2.Separator },
			],
		};

		if (!page.length) {
			container.components.push({
				type: V2.TextDisplay,
				content: "Пока нет семей.",
			});
			containers.push(container);
			continue;
		}

		for (const org of page) {
			// 1) Название (большим текстом)
			// Можно ещё сделать "###" чтобы выглядело крупнее
			container.components.push({
				type: V2.TextDisplay,
				content: org.isFreeze ? `## ❄️ ${org.name}` : `## ${org.name}`,
			});

			// 2) Ровно один ряд из 3 кнопок
			container.components.push({
				type: 1, // ActionRow
				components: [
					{
						type: 2, // Button
						style: 2, // Secondary
						label: "Редактировать",
						custom_id: FAMILY_PANEL.customId.edit(org.id),
					},
					{
						type: 2,
						style: org.isFreeze ? 3 : 2, // Success если разморозить, иначе Secondary
						label: org.isFreeze ? "Разморозить" : "Заморозить",
						custom_id: FAMILY_PANEL.customId.freeze(org.id),
					},
					{
						type: 2,
						style: 4, // Danger
						label: "Удалить",
						custom_id: FAMILY_PANEL.customId.del(org.id),
					},
				],
			});

			container.components.push({ type: V2.Separator });
		}

		containers.push(container);
	}

	return containers;
}

async function getFamilyForum(client: Client): Promise<ForumChannel | null> {
	const forumId = config.DB_FORUM_FAMILY_ID;
	if (!forumId) return null;

	const ch = await client.channels.fetch(forumId).catch(() => null);
	if (!ch || ch.type !== ChannelType.GuildForum) return null;

	return ch as ForumChannel;
}

async function ensureThread(forum: ForumChannel, storedChannelId?: string) {
	// 1) если записан threadId — используем
	if (storedChannelId) {
		const existing = await forum.client.channels.fetch(storedChannelId).catch(() => null);
		if (existing && existing.isThread()) return existing as ThreadChannel;
	}

	// 2) ищем среди активных тредов
	const active = await forum.threads.fetchActive().catch(() => null);
	const foundActive = active?.threads?.find((t) => t.name === FAMILY_PANEL.THREAD_NAME);
	if (foundActive) return foundActive as ThreadChannel;

	// 3) создаём новый
	return await forum.threads.create({
		name: FAMILY_PANEL.THREAD_NAME,
		message: { content: "Служебный тред панели семей." },
	});
}

export async function upsertFamilyListPanel(client: Client) {
	const forum = await getFamilyForum(client);
	if (!forum) {
		return { ok: false as const, reason: "DB_FORUM_FAMILY_ID not set or not a forum" };
	}

	const stored = await prisma.botMessage.findUnique({
		where: { type: FAMILY_PANEL.BOTMSG_TYPE },
	});

	const thread = await ensureThread(forum, stored?.channelId);

	// сортировка: isFreeze=false сверху, true снизу
	const orgs = await prisma.organisation.findMany({
		where: { type: "FAMILY" },
		orderBy: [{ isFreeze: "asc" }, { id: "asc" }],
		select: { id: true, name: true, isFreeze: true },
	});

	const components = buildFamiliesPanelV2Rows(orgs);

	if (stored?.messageId) {
		const msg = await thread.messages.fetch(stored.messageId).catch(() => null);
		if (msg) {
			await msg.edit({
				flags: MessageFlags.IsComponentsV2,
				components: components as any,
			});
			return { ok: true as const, mode: "edited" as const, threadId: thread.id };
		}
	}

	const sent = await thread.send({
		flags: MessageFlags.IsComponentsV2,
		components: components as any,
	});

	await prisma.botMessage.upsert({
		where: { type: FAMILY_PANEL.BOTMSG_TYPE },
		create: {
			type: FAMILY_PANEL.BOTMSG_TYPE,
			messageId: sent.id,
			channelId: thread.id,
		},
		update: {
			messageId: sent.id,
			channelId: thread.id,
		},
	});

	return { ok: true as const, mode: "created" as const, threadId: thread.id };
}