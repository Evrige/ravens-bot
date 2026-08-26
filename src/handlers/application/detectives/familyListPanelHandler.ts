import {
	ButtonInteraction,
	ModalSubmitInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
} from "discord.js";
import {prisma} from "../../../utils/prisma";
import {FAMILY_PANEL, upsertFamilyListPanel} from "../../../services/upsertFamilyListPanel";
import {FACTION_PANEL, upsertFactionListPanel} from "../../../services/upsertFactionListPanel";
import {resetHivePanel} from "../../../services/upsertHivePanel";

function parse(customId: string) {
	// family:list:<action>:<id> / faction:list:<action>:<id>
	const parts = customId.split(":");
	if (parts.length !== 4) return null;
	if ((parts[0] !== "family" && parts[0] !== "faction") || parts[1] !== "list") return null;

	const scope = parts[0] as "family" | "faction";
	const action = parts[2];
	const idStr = parts[3];

	let id: bigint;
	try {
		id = BigInt(idStr);
	} catch {
		return null;
	}

	return { scope, action, id };
}

function getPanel(scope: "family" | "faction") {
	return scope === "family" ? FAMILY_PANEL : FACTION_PANEL;
}

async function upsertListPanel(client: any, scope: "family" | "faction") {
	return scope === "family"
		? upsertFamilyListPanel(client)
		: upsertFactionListPanel(client);
}

/* ===================== BUTTONS ===================== */

export async function handleFamilyListPanelButtons(interaction: ButtonInteraction) {
	if (!interaction.customId.startsWith("family:list:") && !interaction.customId.startsWith("faction:list:")) return false;

	const parsed = parse(interaction.customId);
	if (!parsed) return false;

	const { scope, action, id: orgId } = parsed;
	const panel = getPanel(scope);

	// disabled name-кнопка — игнор
	if (action === "nop") return true;

	// EDIT -> showModal (нельзя deferReply перед showModal)
	if (action === "edit") {
		const org = await prisma.organisation.findUnique({
			where: { id: orgId },
			select: { name: true, color: true, subject: true, adress: true },
		});
		if (!org) {
			// тут уже можно reply
			await interaction.reply({ content: "❌ Организация не найдена.", ephemeral: true });
			return true;
		}

		const modal = new ModalBuilder()
			.setCustomId(panel.customId.editModal(orgId))
			.setTitle(scope === "family" ? "Редактировать семью" : "Редактировать фракцию");

		const nameInput = new TextInputBuilder()
			.setCustomId("name")
			.setLabel("Название")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setValue(org.name ?? "");

		const colorInput = new TextInputBuilder()
			.setCustomId("color")
			.setLabel("Цвет HEX (например #ff0000)")
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setValue(org.color ?? "#5865F2");

		const subjectInput = new TextInputBuilder()
			.setCustomId("subject")
			.setLabel("Subject (необязательно)")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false)
			.setValue(org.subject ?? "");

		const adressInput = new TextInputBuilder()
			.setCustomId("adress")
			.setLabel("Adress (необязательно)")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false)
			.setValue(org.adress ?? "");

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(adressInput),
		);

		await interaction.showModal(modal);
		return true;
	}

	// остальное — обычный flow
	await interaction.deferReply({ ephemeral: true });

	if (action === "freeze") {
		const org = await prisma.organisation.findUnique({
			where: { id: orgId },
			select: { isFreeze: true, name: true },
		});
		if (!org) {
			await interaction.editReply("❌ Организация не найдена.");
			return true;
		}

		const updated = await prisma.organisation.update({
			where: { id: orgId },
			data: { isFreeze: !org.isFreeze },
			select: { isFreeze: true, name: true },
		});

		await upsertListPanel(interaction.client, scope);

		// 2) обновили панель улик (селекты)
		await resetHivePanel(interaction.client).catch(() => {});

		await interaction.editReply(
			`✅ **${updated.name}** теперь ` +
			(updated.isFreeze ? "**заморожена** ❄️" : "**разморожена** ✅")
		);
		return true;
	}

	if (action === "delete") {
		const org = await prisma.organisation.findUnique({
			where: { id: orgId },
			select: { name: true },
		});
		if (!org) {
			await interaction.editReply("❌ Организация не найдена.");
			return true;
		}

		try {
			await prisma.organisation.delete({ where: { id: orgId } });
		} catch (e: any) {
			await interaction.editReply(
				`❌ Не удалось удалить организацию. Возможно есть связанные записи (hives).\n` +
				`Ошибка: ${e?.message ?? e}`
			);
			return true;
		}

		await upsertListPanel(interaction.client, scope);
		await resetHivePanel(interaction.client).catch(() => {});
		await interaction.editReply(`🗑️ Организация **${org.name}** удалена.`);
		return true;
	}

	await interaction.editReply("❌ Неизвестное действие.");
	return true;
}

/* ===================== MODAL SUBMIT ===================== */

export async function handleFamilyEditModal(interaction: ModalSubmitInteraction) {
	const isFamilyModal = interaction.customId.startsWith("family:list:modal_edit:");
	const isFactionModal = interaction.customId.startsWith("faction:list:modal_edit:");
	if (!isFamilyModal && !isFactionModal) return false;
	const scope = isFamilyModal ? "family" : "faction";

	// parse ожидает family:list:<action>:<id> — поэтому разберём вручную
	const parts = interaction.customId.split(":");
	// family:list:modal_edit:<id>
	if (parts.length !== 4) return false;

	let orgId: bigint;
	try {
		orgId = BigInt(parts[3]);
	} catch {
		await interaction.reply({ content: "❌ Некорректный ID.", ephemeral: true });
		return true;
	}

	await interaction.deferReply({ ephemeral: true });

	const name = interaction.fields.getTextInputValue("name")?.trim();
	const color = interaction.fields.getTextInputValue("color")?.trim() || null;
	const subjectRaw = interaction.fields.getTextInputValue("subject")?.trim();
	const adressRaw = interaction.fields.getTextInputValue("adress")?.trim();

	const subject = subjectRaw ? subjectRaw : null;
	const adress = adressRaw ? adressRaw : null;

	if (!name) {
		await interaction.editReply("❌ Название обязательно.");
		return true;
	}

	// простая проверка HEX
	if (color && !/^#([0-9a-f]{6})$/i.test(color)) {
		await interaction.editReply("❌ Цвет должен быть в формате #RRGGBB (например #ff0000).");
		return true;
	}

	// если меняют name — проверим уникальность
	const exists = await prisma.organisation.findFirst({
		where: { name, NOT: { id: orgId } },
		select: { id: true },
	});
	if (exists) {
		await interaction.editReply("❌ Организация с таким названием уже существует.");
		return true;
	}

	const updated = await prisma.organisation.update({
		where: { id: orgId },
		data: {
			name,
			color: color ?? undefined, // если null — не трогаем (можешь поменять поведение)
			subject,
			adress,
		},
		select: { name: true },
	});

	await upsertListPanel(interaction.client, scope);
	await resetHivePanel(interaction.client).catch(() => {});
	await interaction.editReply(`✅ Сохранено: **${updated.name}**`);
	return true;
}
