// src/handlers/cases/handleCases.ts
// ВСЁ В ОДНОМ: создание кейса (с доком сразу), embed, замена улики, пересоздание дока, принятие кейса
//
// Требует в Prisma:
// - Hive.isUsed Boolean @default(false)
// - Case: docId String?, docUrl String?, channelId String?, messageId String?, status String, caseNumber Int, orgId BigInt
// - CaseHive: @@unique([caseId, hiveId])
//
// ВАЖНО: кнопка "Сформировать кейс" у тебя имеет customId: `${CUSTOM_IDS.CREATE_CASE}${org.id}`
// Этот файл парсит orgId именно так.

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	GuildTextBasedChannel,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_IDS } from "../../constants/customIds";
import {createCaseDocument} from "../../services/googleDocs";
import {resetHivePanel} from "../../services/upsertHivePanel";

/* ===================== IDS ===================== */

const CASE_IDS = {
	accept: (caseId: bigint) => `case:accept:${caseId.toString()}`,
	replace: (caseId: bigint) => `case:replace:${caseId.toString()}`,
	replaceModal: (caseId: bigint) => `case:replace_modal:${caseId.toString()}`,
	createModal: (orgId: bigint) => `case:create_modal:${orgId.toString()}`,
	recreateDoc: (caseId: bigint) => `case:recreate_doc:${caseId.toString()}`,
} as const;

/* ===================== TEXT / EMBED ===================== */

function extractStartLine(text: string) {
	const firstLine = (text || "").split("\n")[0]?.trim() ?? "";
	return firstLine.replace(/^Начало записи\s*[:\-]?\s*/i, "").trim();
}

function buildCaseEmbed(params: {
	caseNumber: number | string;
	hives: Array<{ id: bigint; story: string }>;
	docUrl?: string | null;
	status?: "PENDING" | "ACCEPTED";
	orgName?: string | null;
}) {
	const lines = params.hives.map((h, i) => {
		const title = extractStartLine(h.story) || "Улика";
		return `${i + 1}. **[${h.id.toString()}]** ${title}`;
	});

	const embed = new EmbedBuilder()
		.setTitle(`📁 Кейс #${params.caseNumber}`)
		.setDescription(lines.join("\n"))
		.setTimestamp();

	const statusText = params.status === "ACCEPTED" ? "Принят ✅" : "Ожидает ⏳";
	embed.addFields({ name: "Статус", value: statusText, inline: true });

	if (params.orgName) embed.addFields({ name: "Организация", value: params.orgName, inline: true });

	if (params.docUrl) {
		embed.addFields({
			name: "Google Docs",
			value: `[Открыть документ](${params.docUrl})`,
			inline: false,
		});
	}

	return embed;
}

function buildCaseComponents(params: {
	caseId: bigint;
	docUrl?: string | null;
	showRecreate?: boolean;
	accepted?: boolean;
}) {
	// Если принят — оставим только ссылку на документ (если есть)
	if (params.accepted) {
		if (!params.docUrl) return [];
		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📄 Google Doc").setURL(params.docUrl),
			),
		];
	}

	const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];

	// 1) основные кнопки
	rows.push(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(CASE_IDS.replace(params.caseId)).setStyle(ButtonStyle.Secondary).setLabel("Заменить улику"),
			new ButtonBuilder().setCustomId(CASE_IDS.accept(params.caseId)).setStyle(ButtonStyle.Success).setLabel("Принять"),
		),
	);

	// 2) ряд дока: пересоздать + ссылка
	const docRow = new ActionRowBuilder<ButtonBuilder>();

	if (params.showRecreate) {
		docRow.addComponents(
			new ButtonBuilder()
				.setCustomId(CASE_IDS.recreateDoc(params.caseId))
				.setStyle(ButtonStyle.Primary)
				.setLabel("♻️ Пересоздать документ"),
		);
	}

	if (params.docUrl) {
		docRow.addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Link)
				.setLabel("📄 Google Doc")
				.setURL(params.docUrl),
		);
	}

	if (docRow.components.length) rows.push(docRow);

	return rows;
}

/* ===================== SELECT 11 HIVES ===================== */

type HiveWithForm = {
	id: bigint;
	story: string;
	form: "ONE_HALF" | "ONE_QUARTER" | "ONE_FIFTH";
	link?: string | null;
};

function selectHivesForCase(hives: HiveWithForm[]) {
	const halves = hives.filter((h) => h.form === "ONE_HALF").slice(0, 2);
	const quarters = hives.filter((h) => h.form === "ONE_QUARTER").slice(0, 4);
	let fifths = hives.filter((h) => h.form === "ONE_FIFTH").slice(0, 5);

	if (fifths.length < 5) {
		const needed = 5 - fifths.length;
		const extraQuarters = hives
			.filter((h) => h.form === "ONE_QUARTER")
			.slice(4, 4 + needed);
		fifths = [...fifths, ...extraQuarters];
	}

	return [...halves, ...quarters, ...fifths].slice(0, 11);
}

/* ===================== PARSERS ===================== */

// твой customId: `${CUSTOM_IDS.CREATE_CASE}${org.id}`
function parseOrgIdFromCreateCase(customId: string): bigint | null {
	if (!customId.startsWith(CUSTOM_IDS.CREATE_CASE)) return null;
	const orgIdStr = customId.slice(CUSTOM_IDS.CREATE_CASE.length);
	try {
		return BigInt(orgIdStr);
	} catch {
		return null;
	}
}

function parseCaseButton(customId: string): { action: "accept" | "replace"; caseId: bigint } | null {
	const parts = customId.split(":"); // case:<action>:<caseId>
	if (parts.length !== 3) return null;
	if (parts[0] !== "case") return null;
	if (parts[1] !== "accept" && parts[1] !== "replace") return null;
	try {
		return { action: parts[1], caseId: BigInt(parts[2]) };
	} catch {
		return null;
	}
}

function parseRecreateDoc(customId: string): bigint | null {
	// case:recreate_doc:<caseId>
	const parts = customId.split(":");
	if (parts.length !== 3) return null;
	if (parts[0] !== "case" || parts[1] !== "recreate_doc") return null;
	try {
		return BigInt(parts[2]);
	} catch {
		return null;
	}
}

/* ===================== HANDLER: CREATE CASE BUTTON ===================== */

export async function handleCreateCaseButton(interaction: ButtonInteraction) {
	const orgId = parseOrgIdFromCreateCase(interaction.customId);
	if (!orgId) return false;

	// showModal (нельзя deferReply перед showModal)
	const modal = new ModalBuilder()
		.setCustomId(CASE_IDS.createModal(orgId))
		.setTitle("Сформировать кейс");

	const numInput = new TextInputBuilder()
		.setCustomId("caseNumber")
		.setLabel("Номер кейса (число)")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(numInput));

	await interaction.showModal(modal);
	return true;
}

/* ===================== HANDLER: CREATE CASE MODAL ===================== */

export async function handleCreateCaseModal(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith("case:create_modal:")) return false;

	const parts = interaction.customId.split(":"); // case:create_modal:<orgId>
	if (parts.length !== 3) return false;

	let orgId: bigint;
	try {
		orgId = BigInt(parts[2]);
	} catch {
		await interaction.reply({ content: "❌ Некорректный orgId.", flags: MessageFlags.Ephemeral });
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const caseNumberStr = interaction.fields.getTextInputValue("caseNumber").trim();
	const caseNumber = Number(caseNumberStr);

	if (!Number.isFinite(caseNumber) || caseNumber <= 0) {
		await interaction.editReply("❌ Номер кейса должен быть положительным числом.");
		return true;
	}

	if (!interaction.inGuild() || !interaction.channel) {
		await interaction.editReply("❌ Доступно только на сервере.");
		return true;
	}
	const channel = interaction.channel as GuildTextBasedChannel;

	// 1) берём организацию + доступные улики (ACCEPTED + isUsed=false)
	const org = await prisma.organisation.findUnique({
		where: { id: orgId },
		select: {
			id: true,
			name: true,
			hives: {
				where: { status: "ACCEPTED", isUsed: false },
				orderBy: { id: "asc" },
				select: { id: true, story: true, form: true, link: true },
			},
		},
	});

	if (!org) {
		await interaction.editReply("❌ Организация не найдена.");
		return true;
	}

	const selected = selectHivesForCase(org.hives as unknown as HiveWithForm[]);
	if (selected.length < 11) {
		await interaction.editReply(`❌ Недостаточно улик: нужно 11, доступно ${selected.length}.`);
		return true;
	}

	// 2) создаём кейс + связи
	let createdCase: { id: bigint; caseNumber: number };
	try {
		createdCase = await prisma.$transaction(async (tx) => {
			const c = await tx.case.create({
				data: { caseNumber, orgId, status: "PENDING" },
				select: { id: true, caseNumber: true },
			});

			await tx.caseHive.createMany({
				data: selected.map((h) => ({ caseId: c.id, hiveId: h.id })),
				skipDuplicates: true,
			});

			return c;
		});
	} catch (e: any) {
		await interaction.editReply(`❌ Не удалось создать кейс.\n${e?.message ?? e}`);
		return true;
	}

	// 3) создаём Google Doc СРАЗУ по выбранным 11 уликам
	const hiveIds = selected.map((h) => h.id);

	let docUrl: string | null = null;
	let docId: string | null = null;

	try {
		const doc = await createCaseDocument({
			orgId,
			caseNumber,
			hiveIds, // ⚠️ createCaseDocument должен поддерживать hiveIds (см. мои правки)
		} as any);

		docUrl = doc?.url ?? null;
		docId = doc?.docId ?? null;
	} catch (e: any) {
		// если док не создался — кейс всё равно есть; просто без ссылки
		console.error("[case] createCaseDocument failed:", e?.message ?? e);
	}

	// сохраним ссылку (если есть)
	if (docUrl) {
		await prisma.case.update({
			where: { id: createdCase.id },
			data: { docId: docId ?? undefined, docUrl },
		});
	}

	// 4) публикуем embed
	const embed = buildCaseEmbed({
		caseNumber: createdCase.caseNumber,
		hives: selected.map((h) => ({ id: h.id, story: h.story })),
		docUrl,
		status: "PENDING",
		orgName: org.name,
	});

	const msg = await channel.send({
		embeds: [embed],
		components: buildCaseComponents({
			caseId: createdCase.id,
			docUrl,
			showRecreate: false, // пока не было замены
			accepted: false,
		}),
	});

	// 5) сохраняем messageId/channelId
	await prisma.case.update({
		where: { id: createdCase.id },
		data: { channelId: msg.channelId, messageId: msg.id },
	});

	await interaction.editReply("✅ Кейс сформирован и опубликован.");
	return true;
}

/* ===================== HANDLER: CASE BUTTONS (ACCEPT/REPLACE/RECREATE DOC) ===================== */

export async function handleCaseButtons(interaction: ButtonInteraction) {
	// 0) Пересоздать документ
	const recreateCaseId = parseRecreateDoc(interaction.customId);
	if (recreateCaseId) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const c = await prisma.case.findUnique({
			where: { id: recreateCaseId },
			select: {
				id: true,
				orgId: true,
				caseNumber: true,
				status: true,
				channelId: true,
				messageId: true,
				docUrl: true,
				caseHives: { select: { Hive: { select: { id: true, story: true } } } },
			},
		});

		if (!c) {
			await interaction.editReply("❌ Кейс не найден.");
			return true;
		}

		// пересоздавать логично только пока не принят (но ты не запрещал)
		const hiveIds = c.caseHives.map((x) => x.Hive.id);

		let docUrl: string | null = null;
		let docId: string | null = null;

		try {
			const doc = await createCaseDocument({
				orgId: BigInt(c.orgId as any),
				caseNumber: c.caseNumber,
				hiveIds,
			} as any);

			docUrl = doc?.url ?? null;
			docId = doc?.docId ?? null;
		} catch (e: any) {
			await interaction.editReply(`❌ Не удалось пересоздать документ.\n${e?.message ?? e}`);
			return true;
		}

		await prisma.case.update({
			where: { id: recreateCaseId },
			data: { docId: docId ?? undefined, docUrl: docUrl ?? undefined },
		});

		// обновим сообщение кейса
		if (c.channelId && c.messageId) {
			const ch = await interaction.client.channels.fetch(c.channelId).catch(() => null);
			const msg =
				ch && ch.isTextBased()
					? await ch.messages.fetch(c.messageId).catch(() => null)
					: null;

			if (msg) {
				const hives = c.caseHives.map((x) => x.Hive);
				const embed = buildCaseEmbed({
					caseNumber: c.caseNumber,
					hives,
					docUrl,
					status: (c.status as any) === "ACCEPTED" ? "ACCEPTED" : "PENDING",
				});

				await msg.edit({
					embeds: [embed],
					components: buildCaseComponents({
						caseId: recreateCaseId,
						docUrl,
						showRecreate: false, // после пересоздания можно спрятать
						accepted: (c.status as any) === "ACCEPTED",
					}),
				}).catch(() => {});
			}
		}

		await interaction.editReply("✅ Документ пересоздан.");
		return true;
	}

	// 1) accept/replace
	if (!interaction.customId.startsWith("case:")) return false;

	const parsed = parseCaseButton(interaction.customId);
	if (!parsed) return false;

	// REPLACE -> showModal (без deferReply)
	if (parsed.action === "replace") {
		const modal = new ModalBuilder()
			.setCustomId(CASE_IDS.replaceModal(parsed.caseId))
			.setTitle("Заменить улику в кейсе");

		const oldId = new TextInputBuilder()
			.setCustomId("oldHiveId")
			.setLabel("ID улики на замену (в кейсе)")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const newId = new TextInputBuilder()
			.setCustomId("newHiveId")
			.setLabel("ID новой улики (не в кейсе)")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(oldId),
			new ActionRowBuilder<TextInputBuilder>().addComponents(newId),
		);

		await interaction.showModal(modal);
		return true;
	}

	// ACCEPT
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const c = await prisma.case.findUnique({
		where: { id: parsed.caseId },
		include: { caseHives: { select: { hiveId: true } } },
	});

	if (!c) {
		await interaction.editReply("❌ Кейс не найден.");
		return true;
	}
	if ((c.status as any) === "ACCEPTED") {
		await interaction.editReply("ℹ️ Кейс уже принят.");
		return true;
	}

	const hiveIds = c.caseHives.map((x) => x.hiveId);

	await prisma.$transaction(async (tx) => {
		await tx.hive.updateMany({
			where: { id: { in: hiveIds } },
			data: { isUsed: true },
		});

		await tx.case.update({
			where: { id: parsed.caseId },
			data: { status: "ACCEPTED" },
		});
	});

	await resetHivePanel(interaction.client).catch(() => {});

	// обновим сообщение кейса: accepted + оставим только ссылку
	const updated = await prisma.case.findUnique({
		where: { id: parsed.caseId },
		select: {
			caseNumber: true,
			docUrl: true,
			channelId: true,
			messageId: true,
			caseHives: { select: { Hive: { select: { id: true, story: true } } } },
		},
	});

	if (updated?.channelId && updated.messageId) {
		const ch = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
		const msg =
			ch && ch.isTextBased()
				? await ch.messages.fetch(updated.messageId).catch(() => null)
				: null;

		if (msg) {
			const hives = updated.caseHives.map((x) => x.Hive);
			const embed = buildCaseEmbed({
				caseNumber: updated.caseNumber,
				hives,
				docUrl: updated.docUrl ?? null,
				status: "ACCEPTED",
			});

			await msg.edit({
				embeds: [embed],
				components: buildCaseComponents({
					caseId: parsed.caseId,
					docUrl: updated.docUrl ?? null,
					accepted: true,
				}),
			}).catch(() => {});
		}
	}

	await interaction.editReply("✅ Кейс принят. Улики помечены как использованные.");
	return true;
}

/* ===================== HANDLER: REPLACE MODAL SUBMIT ===================== */

export async function handleCaseReplaceModal(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith("case:replace_modal:")) return false;

	const parts = interaction.customId.split(":"); // case:replace_modal:<caseId>
	if (parts.length !== 3) return false;

	let caseId: bigint;
	try {
		caseId = BigInt(parts[2]);
	} catch {
		await interaction.reply({ content: "❌ Некорректный ID кейса.", flags: MessageFlags.Ephemeral });
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const oldHiveIdStr = interaction.fields.getTextInputValue("oldHiveId").trim();
	const newHiveIdStr = interaction.fields.getTextInputValue("newHiveId").trim();

	let oldHiveId: bigint, newHiveId: bigint;
	try {
		oldHiveId = BigInt(oldHiveIdStr);
		newHiveId = BigInt(newHiveIdStr);
	} catch {
		await interaction.editReply("❌ Некорректные ID улик.");
		return true;
	}

	if (oldHiveId === newHiveId) {
		await interaction.editReply("❌ Нельзя заменить улику на саму себя.");
		return true;
	}

	const c = await prisma.case.findUnique({
		where: { id: caseId },
		select: {
			id: true,
			orgId: true,
			status: true,
			caseHives: {
				select: {
					hiveId: true,
					Hive: { select: { id: true, form: true } },
				},
			},
		},
	});

	if (!c) {
		await interaction.editReply("❌ Кейс не найден.");
		return true;
	}
	if ((c.status as any) === "ACCEPTED") {
		await interaction.editReply("❌ Нельзя менять улики в принятом кейсе.");
		return true;
	}

	const inCase = new Set(c.caseHives.map((x) => x.hiveId.toString()));

	if (!inCase.has(oldHiveId.toString())) {
		await interaction.editReply("❌ Улика на замену не найдена в этом кейсе.");
		return true;
	}
	if (inCase.has(newHiveId.toString())) {
		await interaction.editReply("❌ Новая улика уже есть в кейсе.");
		return true;
	}

	// 1) найдём форму улики, которую заменяем (old)
	const oldEntry = c.caseHives.find((x) => x.hiveId.toString() === oldHiveId.toString());
	const oldForm = String(oldEntry?.Hive?.form || "");

// нормализуем в ONE_*
	const normForm = (f: string) => {
		if (f === "1/2") return "ONE_HALF";
		if (f === "1/4") return "ONE_QUARTER";
		if (f === "1/5") return "ONE_FIFTH";
		return f;
	};

	const oldFormNorm = normForm(oldForm);

// 2) загрузим новую улику с org + form
	const newHive = await prisma.hive.findUnique({
		where: { id: newHiveId },
		select: { id: true, status: true, isUsed: true, organisationId: true, form: true },
	});

	if (!newHive || newHive.status !== "ACCEPTED" || newHive.isUsed) {
		await interaction.editReply("❌ Новая улика недоступна (не принята или уже использована).");
		return true;
	}

// 3) проверка организации
	if (newHive.organisationId.toString() !== c.orgId.toString()) {
		await interaction.editReply("❌ Новая улика должна быть из этой же организации.");
		return true;
	}

// 4) проверка формы
	const newFormNorm = normForm(String(newHive.form || ""));

// правила:
// old 1/2 -> new только 1/2
// old 1/4 -> new только 1/4
// old 1/5 -> new 1/5 ИЛИ 1/4
	const allowed =
		oldFormNorm === "ONE_HALF"
			? ["ONE_HALF"]
			: oldFormNorm === "ONE_QUARTER"
				? ["ONE_QUARTER"]
				: oldFormNorm === "ONE_FIFTH"
					? ["ONE_FIFTH", "ONE_QUARTER"] // ✅ 1/5 можно заменить на 1/4
					: [];

	if (!allowed.includes(newFormNorm)) {
		const oldLabel = oldFormNorm === "ONE_HALF" ? "1/2" : oldFormNorm === "ONE_QUARTER" ? "1/4" : "1/5";
		const allowedLabel =
			oldFormNorm === "ONE_FIFTH" ? "1/5 или 1/4" : oldLabel;

		await interaction.editReply(`❌ Нельзя заменить улику формы **${oldLabel}** на **${newFormNorm === "ONE_HALF" ? "1/2" : newFormNorm === "ONE_QUARTER" ? "1/4" : "1/5"}**. Нужно: **${allowedLabel}**.`);
		return true;
	}

	// заменяем связь
	await prisma.$transaction(async (tx) => {
		await tx.caseHive.delete({
			where: { caseId_hiveId: { caseId, hiveId: oldHiveId } } as any,
		});
		await tx.caseHive.create({
			data: { caseId, hiveId: newHiveId },
		});
	});

	// обновим сообщение кейса + покажем кнопку "Пересоздать документ"
	const updated = await prisma.case.findUnique({
		where: { id: caseId },
		select: {
			caseNumber: true,
			docUrl: true,
			channelId: true,
			messageId: true,
			caseHives: { select: { Hive: { select: { id: true, story: true } } } },
		},
	});

	if (updated?.channelId && updated.messageId) {
		const ch = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
		const msg =
			ch && ch.isTextBased()
				? await ch.messages.fetch(updated.messageId).catch(() => null)
				: null;

		if (msg) {
			const hives = updated.caseHives.map((x) => x.Hive);
			const embed = buildCaseEmbed({
				caseNumber: updated.caseNumber,
				hives,
				docUrl: updated.docUrl ?? null,
				status: "PENDING",
			});

			await msg.edit({
				embeds: [embed],
				components: buildCaseComponents({
					caseId,
					docUrl: updated.docUrl ?? null,
					showRecreate: true, // ✅ появляется после замены
					accepted: false,
				}),
			}).catch(() => {});
		}
	}

	await interaction.editReply("✅ Улика заменена. Можно пересоздать документ.");
	return true;
}