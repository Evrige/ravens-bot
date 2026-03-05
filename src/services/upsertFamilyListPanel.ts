// src/services/upsertFamilyListPanel.ts
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

		// ✅ пагинация (листать одной и той же панелью)
		page: (pageIndex: number) => `family:list:page:${pageIndex}`,
	},
} as const;

const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;

/**
 * ✅ ВАЖНО:
 * Discord лимитит "Total number of components cannot exceed 40" НА ВСЁ сообщение.
 * Поэтому мы рендерим ТОЛЬКО ОДНУ страницу (один Container) и листаем кнопками.
 *
 * Формула компонентов:
 *  - сверху 2 (title + separator)
 *  - на 1 семью 3 (TextDisplay + ActionRow + Separator)
 *  => 2 + 3*N <= 40 => N <= 12
 */
function buildFamiliesPanelPage(
	orgs: Array<{ id: bigint; name: string; isFreeze: boolean }>,
	pageIndex: number,
	perPage = 12
) {
	// ✅ если семей нет — возвращаем 1 контейнер с заглушкой,
	// иначе components может быть [] и Discord даст 50006
	if (!orgs.length) {
		return [
			{
				type: V2.Container,
				components: [
					{ type: V2.TextDisplay, content: "## 👨‍👩‍👧‍👦 Семьи" },
					{ type: V2.Separator },
					{ type: V2.TextDisplay, content: "Пока нет семей." },
				],
			},
		] as any[];
	}

	const totalPages = Math.max(1, Math.ceil(orgs.length / perPage));
	const safePage = Math.min(Math.max(pageIndex, 0), totalPages - 1);

	const start = safePage * perPage;
	const page = orgs.slice(start, start + perPage);

	const container: any = {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content:
					totalPages > 1
						? `## 👨‍👩‍👧‍👦 Семьи (стр. ${safePage + 1}/${totalPages})`
						: "## 👨‍👩‍👧‍👦 Семьи",
			},
			{ type: V2.Separator },
		],
	};

	for (const org of page) {
		container.components.push({
			type: V2.TextDisplay,
			content: org.isFreeze ? `## ❄️ ${org.name}` : `## ${org.name}`,
		});

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
					style: org.isFreeze ? 3 : 2, // Success если "Разморозить"
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

	// ✅ навигация (ещё 1 ActionRow)
	if (totalPages > 1) {
		container.components.push({
			type: 1,
			components: [
				{
					type: 2,
					style: 2,
					label: "⬅️ Назад",
					custom_id: FAMILY_PANEL.customId.page(safePage - 1),
					disabled: safePage === 0,
				},
				{
					type: 2,
					style: 2,
					label: "➡️ Вперёд",
					custom_id: FAMILY_PANEL.customId.page(safePage + 1),
					disabled: safePage >= totalPages - 1,
				},
			],
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
	// ⚠️ Если на форуме стоят "обязательные теги", Discord не даст создать пост без appliedTags.
	// - если есть хотя бы один availableTag — ставим первый
	// - если нет — вернём undefined (тогда форум без обязательных тегов)
	const tags = (forum as any).availableTags as Array<{ id: string; name: string }> | undefined;
	if (!tags?.length) return undefined;
	return [tags[0].id];
}

async function ensureThread(forum: ForumChannel, storedChannelId?: string) {
	// 1) сохранённый тред
	if (storedChannelId) {
		const existing = await forum.client.channels.fetch(storedChannelId).catch(() => null);
		if (existing && existing.isThread()) {
			const th = existing as ThreadChannel;
			if (th.archived) await th.setArchived(false).catch(() => null);
			if (th.locked) await th.setLocked(false).catch(() => null);
			return th;
		}
	}

	// 2) активные
	const active = await forum.threads.fetchActive().catch(() => null);
	const foundActive = active?.threads?.find((t) => t.name === FAMILY_PANEL.THREAD_NAME);
	if (foundActive) {
		const th = foundActive as ThreadChannel;
		if (th.archived) await th.setArchived(false).catch(() => null);
		if (th.locked) await th.setLocked(false).catch(() => null);
		return th;
	}

	// 3) архивные (важно для форумов)
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

	// 4) создаём новый пост
	const appliedTags = pickAppliedTagsIfRequired(forum);

	return await forum.threads.create({
		name: FAMILY_PANEL.THREAD_NAME,
		message: { content: "Служебный тред панели семей." },
		...(appliedTags ? { appliedTags } : {}),
	});
}

export async function upsertFamilyListPanel(client: Client) {
	try {
		const forum = await getFamilyForum(client);
		if (!forum) {
			return { ok: false as const, reason: "DB_FORUM_FAMILY_ID not set or not a forum" };
		}

		const stored = await prisma.botMessage.findUnique({
			where: { type: FAMILY_PANEL.BOTMSG_TYPE },
		});

		const thread = await ensureThread(forum, stored?.channelId);

		const orgs = await prisma.organisation.findMany({
			where: { type: "FAMILY" },
			orderBy: [{ isFreeze: "asc" }, { id: "asc" }],
			select: { id: true, name: true, isFreeze: true },
		});

		// ✅ ВАЖНО: создаём ТОЛЬКО 1 страницу, иначе словим лимит 40 компонентов
		const components = buildFamiliesPanelPage(orgs, 0, 12);

		// если сообщение было — редактируем
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

		// иначе — создаём
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
	} catch (e: any) {
		return {
			ok: false as const,
			reason: e?.message ?? "unknown error",
		};
	}
}

/**
 * ✅ Хелпер для обработчика кнопок:
 * customId будет вида "family:list:page:3"
 */
export function parseFamilyListPageCustomId(customId: string): number | null {
	const m = /^family:list:page:(-?\d+)$/.exec(customId);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

/**
 * ✅ Вызови это в обработчике кнопок "page", чтобы перелистывать:
 */
export async function renderFamilyListPage(
	client: Client,
	pageIndex: number
): Promise<{ components: any[]; total: number }> {
	const orgs = await prisma.organisation.findMany({
		where: { type: "FAMILY" },
		orderBy: [{ isFreeze: "asc" }, { id: "asc" }],
		select: { id: true, name: true, isFreeze: true },
	});

	const perPage = 12;
	const totalPages = Math.max(1, Math.ceil(orgs.length / perPage));
	const safePage = Math.min(Math.max(pageIndex, 0), totalPages - 1);

	return {
		components: buildFamiliesPanelPage(orgs, safePage, perPage),
		total: totalPages,
	};
}