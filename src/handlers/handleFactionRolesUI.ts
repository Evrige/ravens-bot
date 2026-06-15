import {
	ActionRowBuilder,
	ButtonInteraction,
	Interaction,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../config/staff";
import { FactionRoleRecord, getFactionRoleById, mutateFactionRoles } from "../utils/factionRolesStore";
import { upsertFactionRolesAdminPanel } from "../services/upsertFactionRolesAdminPanel";
import { upsertFactionRolesPanel } from "../services/upsertFactionRolesPanel";

const FACTION_MANAGE_ROLE_IDS = Array.from(new Set([...FAMILY_HIGH_ROLE_IDS, ...FAMILY_OWNERS_ROLE_IDS]));

function hasFactionManageAccess(interaction: Interaction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FACTION_MANAGE_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function buildFactionRoleModal(customId: string, title: string, initialValue = "") {
	const modal = new ModalBuilder()
		.setCustomId(customId)
		.setTitle(title);

	const nameInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FACTION_ROLES_MODAL_NAME)
		.setLabel("Название фракции")
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(80);

	if (initialValue) {
		nameInput.setValue(initialValue);
	}

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
	);

	return modal;
}

async function refreshFactionPanels(client: Interaction["client"]) {
	await upsertFactionRolesPanel(client).catch(() => {});
	await upsertFactionRolesAdminPanel(client).catch(() => {});
}

async function syncFactionRole(interaction: ButtonInteraction | ModalSubmitInteraction, record: FactionRoleRecord | null, name: string) {
	const guild = interaction.guild;
	if (!guild) {
		throw new Error("guild_not_found");
	}

	let role = record?.roleId ? await guild.roles.fetch(record.roleId).catch(() => null) : null;
	if (!role) {
		const roles = await guild.roles.fetch().catch(() => null);
		role = guild.roles.cache.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
			?? roles?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
			?? null;
	}

	if (!role) {
		role = await guild.roles.create({
			name,
			mentionable: true,
			reason: "Создание роли фракции",
		});
	} else if (role.name !== name || !role.mentionable) {
		await role.edit({ name, mentionable: true, reason: "Обновление роли фракции" });
	}

	return role.id;
}

async function handleToggleFactionRole(interaction: ButtonInteraction) {
	const recordId = interaction.customId.slice(CUSTOM_IDS.FACTION_ROLES_TOGGLE.length);
	const record = await getFactionRoleById(recordId);

	if (!record) {
		await interaction.reply({
			content: "❌ Фракция не найдена. Обнови панель или попроси staff пересоздать её.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const member = interaction.guild?.members.cache.get(interaction.user.id)
		?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
	if (!member) {
		await interaction.reply({
			content: "❌ Не удалось найти тебя на сервере.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const role = await interaction.guild?.roles.fetch(record.roleId).catch(() => null);
	if (!role) {
		await interaction.reply({
			content: "❌ Роль фракции не найдена. Попроси staff пересоздать её.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (member.roles.cache.has(role.id)) {
		await member.roles.remove(role).catch(() => {});
		await interaction.reply({
			content: `✅ Роль **${record.name}** снята.`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await member.roles.add(role).catch(() => {});
	await interaction.reply({
		content: `✅ Роль **${record.name}** выдана.`,
		flags: MessageFlags.Ephemeral,
	}).catch(() => {});
	return true;
}

async function handleDeleteFactionRole(interaction: ButtonInteraction) {
	if (!hasFactionManageAccess(interaction)) {
		await interaction.reply({
			content: "❌ Управлять ролями фракций может только старший состав.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const recordId = interaction.customId.slice(CUSTOM_IDS.FACTION_ROLES_PANEL_DELETE.length);
	const record = await getFactionRoleById(recordId);
	if (!record) {
		await interaction.reply({
			content: "❌ Фракция не найдена.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	const role = await interaction.guild?.roles.fetch(record.roleId).catch(() => null);
	if (role) {
		await role.delete(`Удаление роли фракции ${record.name}`).catch(() => {});
	}

	await mutateFactionRoles((records) => {
		const index = records.findIndex((entry) => entry.id === recordId);
		if (index !== -1) {
			records.splice(index, 1);
		}
	});

	await refreshFactionPanels(interaction.client);
	await interaction.editReply(`✅ Фракция **${record.name}** удалена вместе с ролью.`).catch(() => {});
	return true;
}

async function handleCreateOrEditFactionSubmit(interaction: ModalSubmitInteraction, recordId: string | null) {
	if (!hasFactionManageAccess(interaction)) {
		await interaction.reply({
			content: "❌ Управлять ролями фракций может только старший состав.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const name = interaction.fields.getTextInputValue(CUSTOM_IDS.FACTION_ROLES_MODAL_NAME).trim();
	if (!name) {
		await interaction.reply({
			content: "❌ Название фракции не может быть пустым.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	try {
		const result = await mutateFactionRoles(async (records) => {
			const duplicate = records.find((entry) => entry.id !== recordId && entry.name.toLowerCase() === name.toLowerCase());
			if (duplicate) {
				throw new Error("duplicate_faction_name");
			}

			const now = new Date().toISOString();
			const existing = recordId ? records.find((entry) => entry.id === recordId) ?? null : null;
			if (recordId && !existing) {
				throw new Error("faction_not_found");
			}

			const roleId = await syncFactionRole(interaction, existing, name);
			if (existing) {
				existing.name = name;
				existing.roleId = roleId;
				existing.updatedAt = now;
				return { mode: "edit" as const, record: { ...existing } };
			}

			const created: FactionRoleRecord = {
				id: `faction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				name,
				roleId,
				createdAt: now,
				updatedAt: now,
			};
			records.push(created);
			return { mode: "create" as const, record: created };
		});

		await refreshFactionPanels(interaction.client);
		await interaction.editReply(
			result.mode === "create"
				? `✅ Фракция **${result.record.name}** создана. Роль уже готова.`
				: `✅ Фракция **${result.record.name}** обновлена.`
		).catch(() => {});
	} catch (error: any) {
		console.error("[faction-roles] create/update failed:", error);

		const message = error?.message === "duplicate_faction_name"
			? "❌ Фракция с таким названием уже существует."
			: error?.message === "faction_not_found"
				? "❌ Фракция для редактирования не найдена."
				: error?.rawError?.message || error?.message
					? `❌ Не удалось создать или обновить фракцию. Discord: ${error.rawError?.message || error.message}`
					: "❌ Не удалось создать или обновить фракцию. Проверь права бота на роли.";

		await interaction.editReply(message).catch(() => {});
	}

	return true;
}

export async function handleFactionRolesUI(interaction: Interaction) {
	if (interaction.isButton()) {
		if (interaction.customId.startsWith(CUSTOM_IDS.FACTION_ROLES_TOGGLE)) {
			return handleToggleFactionRole(interaction);
		}

		if (interaction.customId === CUSTOM_IDS.FACTION_ROLES_PANEL_CREATE) {
			if (!hasFactionManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять ролями фракций может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.showModal(
				buildFactionRoleModal(CUSTOM_IDS.FACTION_ROLES_MODAL_CREATE, "Создание фракции")
			).catch(() => {});
			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FACTION_ROLES_PANEL_EDIT)) {
			if (!hasFactionManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять ролями фракций может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const recordId = interaction.customId.slice(CUSTOM_IDS.FACTION_ROLES_PANEL_EDIT.length);
			const record = await getFactionRoleById(recordId);
			if (!record) {
				await interaction.reply({
					content: "❌ Фракция не найдена.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.showModal(
				buildFactionRoleModal(`${CUSTOM_IDS.FACTION_ROLES_MODAL_EDIT}${record.id}`, "Редактирование фракции", record.name)
			).catch(() => {});
			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FACTION_ROLES_PANEL_DELETE)) {
			return handleDeleteFactionRole(interaction);
		}
	}

	if (interaction.isModalSubmit()) {
		if (interaction.customId === CUSTOM_IDS.FACTION_ROLES_MODAL_CREATE) {
			return handleCreateOrEditFactionSubmit(interaction, null);
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FACTION_ROLES_MODAL_EDIT)) {
			const recordId = interaction.customId.slice(CUSTOM_IDS.FACTION_ROLES_MODAL_EDIT.length);
			return handleCreateOrEditFactionSubmit(interaction, recordId);
		}
	}

	return false;
}
