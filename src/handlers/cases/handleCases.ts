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
import { createCaseDocument } from "../../services/googleDocs";
import { resetHivePanel } from "../../services/upsertHivePanel";
import { postHiveToForum } from "../application/detectives/postHiveToOrgForum";

/* ===================== IDS ===================== */

const CASE_IDS = {
	accept: (caseId: bigint) => `case:accept:${caseId.toString()}`,
	replace: (caseId: bigint) => `case:replace:${caseId.toString()}`,
	replaceModal: (caseId: bigint) => `case:replace_modal:${caseId.toString()}`,
	createModal: (orgId: bigint) => `case:create_modal:${orgId.toString()}`,
	recreateDoc: (caseId: bigint) => `case:recreate_doc:${caseId.toString()}`,
} as const;

/* ===================== EMBED ===================== */

function extractChannelIdFromLogUrl(logUrl?: string | null): string | null {
	if (!logUrl) return null;

	// https://discord.com/channels/guildId/channelId/messageId
	const m = logUrl.match(/discord\.com\/channels\/\d+\/(\d+)\/\d+/);
	return m?.[1] ?? null;
}

function buildCaseEmbed(params: {
	caseId?: bigint | string;
	caseNumber: number | string;
	hives: Array<{ id: bigint; logUrl?: string | null }>;
	docUrl?: string | null;
	status?: "PENDING" | "ACCEPTED";
	orgName?: string | null;
}) {
	const lines = params.hives.map((h) => {
		const channelId = extractChannelIdFromLogUrl(h.logUrl);
		const logPart = channelId ? `<#${channelId}>` : "`лог недоступен`";
		return `${h.id.toString()} - ${logPart}`;
	});

	const embed = new EmbedBuilder()
		.setTitle(`📁 Кейс #${params.caseNumber}`)
		.setDescription(lines.length ? lines.join("\n") : "Улик нет.")
		.setTimestamp();

	const statusText = params.status === "ACCEPTED" ? "Принят ✅" : "Ожидает ⏳";
	embed.addFields({ name: "Статус", value: statusText, inline: true });

	if (params.caseId) {
		embed.addFields({
			name: "ID кейса",
			value: `\`${params.caseId.toString()}\``,
			inline: true,
		});
	}

	if (params.orgName) {
		embed.addFields({ name: "Организация", value: params.orgName, inline: true });
	}

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
	if (params.accepted) {
		if (!params.docUrl) return [];
		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📄 Google Doc").setURL(params.docUrl),
			),
		];
	}

	const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];

	rows.push(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(CASE_IDS.replace(params.caseId))
				.setStyle(ButtonStyle.Secondary)
				.setLabel("Заменить улику"),
			new ButtonBuilder().setCustomId(CASE_IDS.accept(params.caseId)).setStyle(ButtonStyle.Success).setLabel("Принять"),
		),
	);

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
		docRow.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📄 Google Doc").setURL(params.docUrl));
	}

	if (docRow.components.length) rows.push(docRow);

	return rows;
}

/* ===================== SELECT HIVES ===================== */

type HiveWithForm = {
	id: bigint;
	form: "ONE_HALF" | "ONE_QUARTER" | "ONE_FIFTH";
	link?: string | null;
	logUrl?: string | null;
};

function selectHivesForCase(hives: HiveWithForm[]) {
	const halves = hives.filter((h) => h.form === "ONE_HALF").slice(0, 2);
	const quarters = hives.filter((h) => h.form === "ONE_QUARTER").slice(0, 4);
	const fifths = hives.filter((h) => h.form === "ONE_FIFTH").slice(0, 5);

	return [...halves, ...quarters, ...fifths].slice(0, 11);
}

/* ===================== PARSERS ===================== */

function parseOrgIdFromCreateCase(customId: string): bigint | null {
	if (!customId.startsWith(CUSTOM_IDS.CREATE_CASE)) return null;
	const orgIdStr = customId.slice(CUSTOM_IDS.CREATE_CASE.length);
	try {
		return BigInt(orgIdStr);
	} catch {
		return null;
	}
}

function parseOrgIdFromDeleteHive(customId: string): bigint | null {
	if (!customId.startsWith(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM)) return null;
	const orgIdStr = customId.slice(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM.length);
	try {
		return BigInt(orgIdStr);
	} catch {
		return null;
	}
}

function parseDeleteHiveModal(customId: string): bigint | null {
	if (!customId.startsWith(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM_MODAL)) return null;
	const orgIdStr = customId.slice(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM_MODAL.length);
	try {
		return BigInt(orgIdStr);
	} catch {
		return null;
	}
}

function parseCaseButton(customId: string): { action: "accept" | "replace"; caseId: bigint } | null {
	const parts = customId.split(":");
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
	const parts = customId.split(":");
	if (parts.length !== 3) return null;
	if (parts[0] !== "case" || parts[1] !== "recreate_doc") return null;

	try {
		return BigInt(parts[2]);
	} catch {
		return null;
	}
}

async function refreshCaseMessagesForCases(interaction: ModalSubmitInteraction, caseIds: bigint[]) {
	for (const caseId of caseIds) {
		const c = await prisma.case.findUnique({
			where: { id: caseId },
			select: {
				id: true,
				caseNumber: true,
				status: true,
				docUrl: true,
				channelId: true,
				messageId: true,
				caseHives: {
					select: {
						Hive: { select: { id: true, logUrl: true } },
					},
				},
			},
		});

		if (!c?.channelId || !c.messageId) continue;

		const ch = await interaction.client.channels.fetch(c.channelId).catch(() => null);
		const msg = ch && ch.isTextBased() ? await ch.messages.fetch(c.messageId).catch(() => null) : null;
		if (!msg) continue;

		const accepted = (c.status as any) === "ACCEPTED";
		await msg
			.edit({
				embeds: [
					buildCaseEmbed({
						caseId: c.id,
						caseNumber: c.caseNumber,
						hives: c.caseHives.map((x) => x.Hive),
						docUrl: c.docUrl ?? null,
						status: accepted ? "ACCEPTED" : "PENDING",
					}),
				],
				components: buildCaseComponents({
					caseId: c.id,
					docUrl: c.docUrl ?? null,
					showRecreate: !accepted && Boolean(c.docUrl),
					accepted,
				}),
			})
			.catch(() => {});
	}
}

/* ===================== CREATE CASE BUTTON ===================== */

export async function handleCreateCaseButton(interaction: ButtonInteraction) {
	const orgId = parseOrgIdFromCreateCase(interaction.customId);
	if (!orgId) return false;

	const modal = new ModalBuilder().setCustomId(CASE_IDS.createModal(orgId)).setTitle("Сформировать кейс");

	const numInput = new TextInputBuilder()
		.setCustomId("caseNumber")
		.setLabel("Номер кейса (число)")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(numInput));

	await interaction.showModal(modal);
	return true;
}

export async function handleDeleteHiveFromForumButton(interaction: ButtonInteraction) {
	const orgId = parseOrgIdFromDeleteHive(interaction.customId);
	if (!orgId) return false;

	const modal = new ModalBuilder()
		.setCustomId(`${CUSTOM_IDS.DELETE_HIVE_FROM_FORUM_MODAL}${orgId.toString()}`)
		.setTitle("Удалить улику");

	const hiveIdInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM_INPUT)
		.setLabel("ID улики")
		.setPlaceholder("Например: 123")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(hiveIdInput));

	await interaction.showModal(modal);
	return true;
}

/* ===================== CREATE CASE MODAL ===================== */

export async function handleCreateCaseModal(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith("case:create_modal:")) return false;

	const parts = interaction.customId.split(":");
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

	const org = await prisma.organisation.findUnique({
		where: { id: orgId },
		select: {
			id: true,
			name: true,
			hives: {
				where: { status: "ACCEPTED", isUsed: false },
				orderBy: { id: "asc" },
				select: { id: true, form: true, link: true, logUrl: true },
			},
		},
	});

	if (!org) {
		await interaction.editReply("❌ Организация не найдена.");
		return true;
	}

	const selected = selectHivesForCase(org.hives as unknown as HiveWithForm[]);

	if (selected.length === 0) {
		await interaction.editReply("❌ Нет доступных улик для формирования кейса.");
		return true;
	}

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

	const hiveIds = selected.map((h) => h.id);

	let docUrl: string | null = null;
	let docId: string | null = null;

	if (hiveIds.length) {
		try {
			const doc = await createCaseDocument({
				orgId,
				caseNumber,
				hiveIds,
			} as any);

			docUrl = doc?.url ?? null;
			docId = doc?.docId ?? null;
		} catch (e: any) {
			console.error("[case] createCaseDocument failed:", e?.message ?? e);
		}
	}

	if (docUrl) {
		await prisma.case.update({
			where: { id: createdCase.id },
			data: { docId: docId ?? undefined, docUrl },
		});
	}

	const embed = buildCaseEmbed({
		caseId: createdCase.id,
		caseNumber: createdCase.caseNumber,
		hives: selected.map((h) => ({
			id: h.id,
			logUrl: h.logUrl ?? null,
		})),
		docUrl,
		status: "PENDING",
		orgName: org.name,
	});

	const msg = await channel.send({
		embeds: [embed],
		components: buildCaseComponents({
			caseId: createdCase.id,
			docUrl,
			showRecreate: false,
			accepted: false,
		}),
	});

	await prisma.case.update({
		where: { id: createdCase.id },
		data: { channelId: msg.channelId, messageId: msg.id },
	});

	await interaction.editReply(`✅ Кейс сформирован и опубликован. Улик: **${selected.length}**.`);
	return true;
}

export async function handleDeleteHiveFromForumModal(interaction: ModalSubmitInteraction) {
	const orgId = parseDeleteHiveModal(interaction.customId);
	if (!orgId) return false;

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const hiveIdRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.DELETE_HIVE_FROM_FORUM_INPUT).trim();

	let hiveId: bigint;
	try {
		hiveId = BigInt(hiveIdRaw);
	} catch {
		await interaction.editReply("❌ Некорректный ID улики.");
		return true;
	}

	const hive = await prisma.hive.findUnique({
		where: { id: hiveId },
		include: { organisation: true },
	});

	if (!hive) {
		await interaction.editReply("❌ Улика не найдена.");
		return true;
	}

	if (hive.organisationId.toString() !== orgId.toString()) {
		await interaction.editReply("❌ Эта улика относится к другой организации.");
		return true;
	}

	const affectedCaseIds = await prisma.caseHive.findMany({
		where: { hiveId },
		select: { caseId: true },
	});

	await prisma.$transaction(async (tx) => {
		await tx.caseHive.deleteMany({ where: { hiveId } });
		await tx.hive.update({
			where: { id: hiveId },
			data: { isUsed: true },
		});
	});

	if (interaction.guild) {
		await postHiveToForum({
			guild: interaction.guild,
			hiveIdStr: hiveId.toString(),
		}).catch(() => {});
	}

	await refreshCaseMessagesForCases(interaction, affectedCaseIds.map((x) => x.caseId));
	await resetHivePanel(interaction.client).catch(() => {});

	const caseText = affectedCaseIds.length
		? ` Удалена из кейсов: **${affectedCaseIds.length}**.`
		: "";

	await interaction.editReply(`✅ Улика **${hiveId.toString()}** помечена как использованная.${caseText}`);
	return true;
}

/* ===================== CASE BUTTONS ===================== */

export async function handleCaseButtons(interaction: ButtonInteraction) {
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
				caseHives: {
					select: {
						Hive: { select: { id: true, logUrl: true } },
					},
				},
			},
		});

		if (!c) {
			await interaction.editReply("❌ Кейс не найден.");
			return true;
		}

		const hiveIds = c.caseHives.map((x) => x.Hive.id);

		if (!hiveIds.length) {
			await interaction.editReply("❌ В кейсе нет улик — документ не из чего формировать.");
			return true;
		}

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

		if (c.channelId && c.messageId) {
			const ch = await interaction.client.channels.fetch(c.channelId).catch(() => null);
			const msg = ch && ch.isTextBased() ? await ch.messages.fetch(c.messageId).catch(() => null) : null;

			if (msg) {
				const hives = c.caseHives.map((x) => x.Hive);
				const embed = buildCaseEmbed({
					caseId: c.id,
					caseNumber: c.caseNumber,
					hives,
					docUrl,
					status: (c.status as any) === "ACCEPTED" ? "ACCEPTED" : "PENDING",
				});

				await msg
					.edit({
						embeds: [embed],
						components: buildCaseComponents({
							caseId: recreateCaseId,
							docUrl,
							showRecreate: false,
							accepted: (c.status as any) === "ACCEPTED",
						}),
					})
					.catch(() => {});
			}
		}

		await interaction.editReply("✅ Документ пересоздан.");
		return true;
	}

	if (!interaction.customId.startsWith("case:")) return false;

	const parsed = parseCaseButton(interaction.customId);
	if (!parsed) return false;

	if (parsed.action === "replace") {
		const modal = new ModalBuilder().setCustomId(CASE_IDS.replaceModal(parsed.caseId)).setTitle("Заменить улику в кейсе");

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

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(oldId), new ActionRowBuilder<TextInputBuilder>().addComponents(newId));

		await interaction.showModal(modal);
		return true;
	}

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
		if (hiveIds.length) {
			await tx.hive.updateMany({
				where: { id: { in: hiveIds } },
				data: { isUsed: true },
			});
		}

		await tx.case.update({
			where: { id: parsed.caseId },
			data: { status: "ACCEPTED" },
		});
	});

	await resetHivePanel(interaction.client).catch(() => {});

	const updated = await prisma.case.findUnique({
		where: { id: parsed.caseId },
		select: {
			id: true,
			caseNumber: true,
			docUrl: true,
			channelId: true,
			messageId: true,
			caseHives: {
				select: {
					Hive: { select: { id: true, logUrl: true } },
				},
			},
		},
	});

	if (updated?.channelId && updated.messageId) {
		const ch = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
		const msg = ch && ch.isTextBased() ? await ch.messages.fetch(updated.messageId).catch(() => null) : null;

		if (msg) {
			const hives = updated.caseHives.map((x) => x.Hive);
			const embed = buildCaseEmbed({
				caseId: updated.id,
				caseNumber: updated.caseNumber,
				hives,
				docUrl: updated.docUrl ?? null,
				status: "ACCEPTED",
			});

			await msg
				.edit({
					embeds: [embed],
					components: buildCaseComponents({
						caseId: parsed.caseId,
						docUrl: updated.docUrl ?? null,
						accepted: true,
					}),
				})
				.catch(() => {});
		}
	}

	await interaction.editReply("✅ Кейс принят. Улики помечены как использованные.");
	return true;
}

/* ===================== REPLACE MODAL SUBMIT ===================== */

export async function handleCaseReplaceModal(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith("case:replace_modal:")) return false;

	const parts = interaction.customId.split(":");
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

	let oldHiveId: bigint;
	let newHiveId: bigint;
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
			caseNumber: true,
			status: true,
			docUrl: true,
			channelId: true,
			messageId: true,
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

	const oldEntry = c.caseHives.find((x) => x.hiveId.toString() === oldHiveId.toString());
	const oldForm = String(oldEntry?.Hive?.form || "");

	const normForm = (f: string) => {
		if (f === "1/2") return "ONE_HALF";
		if (f === "1/4") return "ONE_QUARTER";
		if (f === "1/5") return "ONE_FIFTH";
		return f;
	};

	const oldFormNorm = normForm(oldForm);

	const newHive = await prisma.hive.findUnique({
		where: { id: newHiveId },
		select: { id: true, status: true, isUsed: true, organisationId: true, form: true },
	});

	if (!newHive || newHive.status !== "ACCEPTED" || newHive.isUsed) {
		await interaction.editReply("❌ Новая улика недоступна (не принята или уже использована).");
		return true;
	}

	if (newHive.organisationId.toString() !== c.orgId.toString()) {
		await interaction.editReply("❌ Новая улика должна быть из этой же организации.");
		return true;
	}

	const newFormNorm = normForm(String(newHive.form || ""));

	const allowed =
		oldFormNorm === "ONE_HALF"
			? ["ONE_HALF"]
			: oldFormNorm === "ONE_QUARTER"
				? ["ONE_QUARTER"]
				: oldFormNorm === "ONE_FIFTH"
					? ["ONE_FIFTH", "ONE_QUARTER"]
					: [];

	if (!allowed.includes(newFormNorm)) {
		const oldLabel = oldFormNorm === "ONE_HALF" ? "1/2" : oldFormNorm === "ONE_QUARTER" ? "1/4" : "1/5";
		const newLabel = newFormNorm === "ONE_HALF" ? "1/2" : newFormNorm === "ONE_QUARTER" ? "1/4" : "1/5";
		const allowedLabel = oldFormNorm === "ONE_FIFTH" ? "1/5 или 1/4" : oldLabel;

		await interaction.editReply(`❌ Нельзя заменить улику формы **${oldLabel}** на **${newLabel}**. Нужно: **${allowedLabel}**.`);
		return true;
	}

	await prisma.$transaction(async (tx) => {
		await tx.caseHive.delete({
			where: { caseId_hiveId: { caseId, hiveId: oldHiveId } } as any,
		});
		await tx.caseHive.create({
			data: { caseId, hiveId: newHiveId },
		});
	});

	const updated = await prisma.case.findUnique({
		where: { id: caseId },
		select: {
			id: true,
			caseNumber: true,
			docUrl: true,
			channelId: true,
			messageId: true,
			caseHives: {
				select: {
					Hive: { select: { id: true, logUrl: true } },
				},
			},
		},
	});

	if (updated?.channelId && updated.messageId) {
		const ch = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
		const msg = ch && ch.isTextBased() ? await ch.messages.fetch(updated.messageId).catch(() => null) : null;

		if (msg) {
			const hives = updated.caseHives.map((x) => x.Hive);
			const embed = buildCaseEmbed({
				caseId: updated.id,
				caseNumber: updated.caseNumber,
				hives,
				docUrl: updated.docUrl ?? null,
				status: "PENDING",
			});

			await msg
				.edit({
					embeds: [embed],
					components: buildCaseComponents({
						caseId,
						docUrl: updated.docUrl ?? null,
						showRecreate: true,
						accepted: false,
					}),
				})
				.catch(() => {});
		}
	}

	await interaction.editReply("✅ Улика заменена. Можно пересоздать документ.");
	return true;
}
