import {
	ActionRowBuilder,
	ButtonInteraction,
	ChannelType,
	Interaction,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	PermissionFlagsBits,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import { FamilyGameRecord, getFamilyGameById, mutateFamilyGames } from "../utils/familyGamesStore";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../config/staff";
import { CHANNEL_IDS } from "../config/channels";
import { upsertFamilyGamesAdminPanel } from "../services/upsertFamilyGamesAdminPanel";
import { upsertFamilyGamesPanel } from "../services/upsertFamilyGamesPanel";

const GAMES_MANAGE_ROLE_IDS = Array.from(new Set([...FAMILY_HIGH_ROLE_IDS, ...FAMILY_OWNERS_ROLE_IDS]));

function hasGamesManageAccess(interaction: Interaction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return GAMES_MANAGE_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function sanitizeChannelName(name: string) {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-zа-я0-9_-]/gi, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 90) || "game";
}

function buildGameModal(customId: string, title: string, initialValue = "") {
	const modal = new ModalBuilder()
		.setCustomId(customId)
		.setTitle(title);

	const nameInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_GAMES_MODAL_NAME)
		.setLabel("Название игры")
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

async function resolveValidStaffRoleIds(interaction: ButtonInteraction | ModalSubmitInteraction) {
	const guild = interaction.guild;
	if (!guild) return [];

	const validRoleIds: string[] = [];
	for (const roleId of GAMES_MANAGE_ROLE_IDS.filter((value) => value.trim().length > 0)) {
		const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
		if (role) {
			validRoleIds.push(role.id);
		}
	}

	return Array.from(new Set(validRoleIds));
}

function buildBasePermissionOverwrites(everyoneRoleId: string, gameRoleId: string, staffRoleIds: string[]) {
	const staffOverwrites = staffRoleIds.map((roleId) => ({
		id: roleId,
		allow: [
			PermissionFlagsBits.ViewChannel,
			PermissionFlagsBits.SendMessages,
			PermissionFlagsBits.ReadMessageHistory,
			PermissionFlagsBits.Connect,
			PermissionFlagsBits.Speak,
		],
	}));

	return {
		everyoneRoleId,
		gameRoleId,
		staffOverwrites,
	};
}

async function syncGameResources(
	interaction: ButtonInteraction | ModalSubmitInteraction,
	game: FamilyGameRecord | null,
	name: string
) {
	const guild = interaction.guild;
	if (!guild) {
		throw new Error("guild_not_found");
	}

	const category = await guild.channels.fetch(CHANNEL_IDS.FAMILY_GAMES_CATEGORY).catch(() => null);
	if (!category || category.type !== ChannelType.GuildCategory) {
		throw new Error("games_category_not_found");
	}

	const createdChannelIds: string[] = [];
	let createdRoleId: string | null = null;

	try {
		let role = game?.roleId ? await guild.roles.fetch(game.roleId).catch(() => null) : null;
		if (!role) {
			const existingRoleByName = guild.roles.cache.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
				?? (await guild.roles.fetch().catch(() => null))?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
				?? null;
			role = existingRoleByName;
		}

		if (!role) {
			role = await guild.roles.create({
				name,
				mentionable: true,
				reason: "Создание роли игры",
			});
			createdRoleId = role.id;
		} else if (role.name !== name) {
			await role.edit({ name, mentionable: true, reason: "Обновление роли игры" }).catch(() => {});
		}

		const staffRoleIds = await resolveValidStaffRoleIds(interaction);
		const base = buildBasePermissionOverwrites(guild.roles.everyone.id, role.id, staffRoleIds);
		const textChannelName = `${sanitizeChannelName(name)}-chat`;
		const textPermissionOverwrites = [
			{ id: base.everyoneRoleId, deny: [PermissionFlagsBits.ViewChannel] },
			{
				id: base.gameRoleId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.ReadMessageHistory,
					PermissionFlagsBits.AttachFiles,
					PermissionFlagsBits.EmbedLinks,
					PermissionFlagsBits.AddReactions,
				],
			},
			...base.staffOverwrites,
		];
		const voicePermissionOverwrites = [
			{ id: base.everyoneRoleId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
			{
				id: base.gameRoleId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.Connect,
					PermissionFlagsBits.Speak,
					PermissionFlagsBits.Stream,
					PermissionFlagsBits.UseVAD,
				],
			},
			...base.staffOverwrites,
		];

		let textChannel = game?.textChannelId ? await guild.channels.fetch(game.textChannelId).catch(() => null) : null;
		if (!textChannel || textChannel.type !== ChannelType.GuildText) {
			textChannel = await guild.channels.create({
				name: textChannelName,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: textPermissionOverwrites,
				reason: `Создание текстового канала для игры ${name}`,
			});
			createdChannelIds.push(textChannel.id);
		} else {
			await textChannel.edit({
				name: textChannelName,
				parent: category.id,
				permissionOverwrites: textPermissionOverwrites,
				reason: `Синхронизация текстового канала для игры ${name}`,
			}).catch(() => {});
		}

		const currentVoiceChannels = (
			await Promise.all((game?.voiceChannelIds ?? []).map((id) => guild.channels.fetch(id).catch(() => null)))
		).filter((channel): channel is Exclude<typeof channel, null> => channel?.type === ChannelType.GuildVoice);

		while (currentVoiceChannels.length < 2) {
			const voiceChannel = await guild.channels.create({
				name: `${name} ${currentVoiceChannels.length + 1}`,
				type: ChannelType.GuildVoice,
				parent: category.id,
				permissionOverwrites: voicePermissionOverwrites,
				reason: `Создание голосового канала для игры ${name}`,
			});
			currentVoiceChannels.push(voiceChannel);
			createdChannelIds.push(voiceChannel.id);
		}

		const syncedVoiceIds: string[] = [];
		for (let index = 0; index < 2; index += 1) {
			const voiceChannel = currentVoiceChannels[index];
			await voiceChannel.edit({
				name: `${name} ${index + 1}`,
				parent: category.id,
				permissionOverwrites: voicePermissionOverwrites,
				reason: `Синхронизация голосового канала для игры ${name}`,
			}).catch(() => {});
			syncedVoiceIds.push(voiceChannel.id);
		}

		return {
			roleId: role.id,
			textChannelId: textChannel.id,
			voiceChannelIds: syncedVoiceIds,
		};
	} catch (error) {
		for (const channelId of createdChannelIds) {
			const channel = await guild.channels.fetch(channelId).catch(() => null);
			if (channel) {
				await channel.delete("Откат частично созданной игры").catch(() => {});
			}
		}

		if (createdRoleId) {
			const role = await guild.roles.fetch(createdRoleId).catch(() => null);
			if (role) {
				await role.delete("Откат частично созданной роли игры").catch(() => {});
			}
		}

		throw error;
	}
}

async function refreshGamesPanels(client: Interaction["client"]) {
	await upsertFamilyGamesPanel(client).catch(() => {});
	await upsertFamilyGamesAdminPanel(client).catch(() => {});
}

async function handleToggleGameRole(interaction: ButtonInteraction) {
	const gameId = interaction.customId.slice(CUSTOM_IDS.FAMILY_GAMES_ROLE_TOGGLE.length);
	const game = await getFamilyGameById(gameId);

	if (!game) {
		await interaction.reply({
			content: "❌ Игра не найдена. Обнови панель или попроси staff пересоздать её.",
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

	const role = await interaction.guild?.roles.fetch(game.roleId).catch(() => null);
	if (!role) {
		await interaction.reply({
			content: "❌ Роль игры не найдена. Открой edit у игры, чтобы бот восстановил её.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const hasRole = member.roles.cache.has(role.id);
	if (hasRole) {
		await member.roles.remove(role).catch(() => {});
		await interaction.reply({
			content: `✅ Роль **${game.name}** снята.`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await member.roles.add(role).catch(() => {});
	await interaction.reply({
		content: `✅ Роль **${game.name}** выдана. Каналы игры уже доступны.`,
		flags: MessageFlags.Ephemeral,
	}).catch(() => {});
	return true;
}

async function handleDeleteGame(interaction: ButtonInteraction) {
	if (!hasGamesManageAccess(interaction)) {
		await interaction.reply({
			content: "❌ Управлять игровыми ролями может только старший состав.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const gameId = interaction.customId.slice(CUSTOM_IDS.FAMILY_GAMES_PANEL_DELETE.length);
	const game = await getFamilyGameById(gameId);
	if (!game) {
		await interaction.reply({
			content: "❌ Игра не найдена.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	const guild = interaction.guild;
	if (guild) {
		for (const channelId of [game.textChannelId, ...game.voiceChannelIds]) {
			const channel = await guild.channels.fetch(channelId).catch(() => null);
			if (channel) {
				await channel.delete(`Удаление игры ${game.name}`).catch(() => {});
			}
		}

		const role = await guild.roles.fetch(game.roleId).catch(() => null);
		if (role) {
			await role.delete(`Удаление роли игры ${game.name}`).catch(() => {});
		}
	}

	await mutateFamilyGames((games) => {
		const index = games.findIndex((entry) => entry.id === gameId);
		if (index !== -1) {
			games.splice(index, 1);
		}
	});

	await refreshGamesPanels(interaction.client);
	await interaction.editReply(`✅ Игра **${game.name}** удалена вместе с ролью и каналами.`).catch(() => {});
	return true;
}

async function handleCreateOrEditGameSubmit(interaction: ModalSubmitInteraction, gameId: string | null) {
	if (!hasGamesManageAccess(interaction)) {
		await interaction.reply({
			content: "❌ Управлять игровыми ролями может только старший состав.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const name = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_GAMES_MODAL_NAME).trim();
	if (!name) {
		await interaction.reply({
			content: "❌ Название игры не может быть пустым.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	try {
		const result = await mutateFamilyGames(async (games) => {
			const duplicate = games.find((entry) => entry.id !== gameId && entry.name.toLowerCase() === name.toLowerCase());
			if (duplicate) {
				throw new Error("duplicate_game_name");
			}

			const now = new Date().toISOString();
			const existing = gameId ? games.find((entry) => entry.id === gameId) ?? null : null;
			if (gameId && !existing) {
				throw new Error("game_not_found");
			}

			const synced = await syncGameResources(interaction, existing, name);
			if (existing) {
				existing.name = name;
				existing.roleId = synced.roleId;
				existing.textChannelId = synced.textChannelId;
				existing.voiceChannelIds = synced.voiceChannelIds;
				existing.updatedAt = now;
				return { mode: "edit" as const, game: { ...existing } };
			}

			const created: FamilyGameRecord = {
				id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				name,
				roleId: synced.roleId,
				textChannelId: synced.textChannelId,
				voiceChannelIds: synced.voiceChannelIds,
				createdAt: now,
				updatedAt: now,
			};
			games.push(created);
			return { mode: "create" as const, game: created };
		});

		await refreshGamesPanels(interaction.client);
		await interaction.editReply(
			result.mode === "create"
				? `✅ Игра **${result.game.name}** создана. Роль и каналы уже готовы.`
				: `✅ Игра **${result.game.name}** обновлена.`
		).catch(() => {});
	} catch (error: any) {
		console.error("[family-games] create/update failed:", error);

		const discordMessage =
			error?.rawError?.message ||
			error?.message ||
			null;
		const message = error?.message === "duplicate_game_name"
			? "❌ Игра с таким названием уже существует."
			: error?.message === "games_category_not_found"
				? "❌ Не найдена категория для игровых каналов. Проверь FAMILY_GAMES_CATEGORY_CHANNEL_ID."
				: error?.message === "game_not_found"
					? "❌ Игра для редактирования не найдена."
					: discordMessage
						? `❌ Не удалось создать или обновить игру. Discord: ${discordMessage}`
						: "❌ Не удалось создать или обновить игру. Проверь права бота на роли и каналы.";
		await interaction.editReply(message).catch(() => {});
	}

	return true;
}

export async function handleFamilyGamesUI(interaction: Interaction) {
	if (interaction.isButton()) {
		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_GAMES_ROLE_TOGGLE)) {
			return handleToggleGameRole(interaction);
		}

		if (interaction.customId === CUSTOM_IDS.FAMILY_GAMES_PANEL_CREATE) {
			if (!hasGamesManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять игровыми ролями может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.showModal(
				buildGameModal(CUSTOM_IDS.FAMILY_GAMES_MODAL_CREATE, "Создание игры")
			).catch(() => {});
			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_GAMES_PANEL_EDIT)) {
			if (!hasGamesManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять игровыми ролями может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const gameId = interaction.customId.slice(CUSTOM_IDS.FAMILY_GAMES_PANEL_EDIT.length);
			const game = await getFamilyGameById(gameId);
			if (!game) {
				await interaction.reply({
					content: "❌ Игра не найдена.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.showModal(
				buildGameModal(`${CUSTOM_IDS.FAMILY_GAMES_MODAL_EDIT}${game.id}`, "Редактирование игры", game.name)
			).catch(() => {});
			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_GAMES_PANEL_DELETE)) {
			return handleDeleteGame(interaction);
		}
	}

	if (interaction.isModalSubmit()) {
		if (interaction.customId === CUSTOM_IDS.FAMILY_GAMES_MODAL_CREATE) {
			return handleCreateOrEditGameSubmit(interaction, null);
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_GAMES_MODAL_EDIT)) {
			const gameId = interaction.customId.slice(CUSTOM_IDS.FAMILY_GAMES_MODAL_EDIT.length);
			return handleCreateOrEditGameSubmit(interaction, gameId);
		}
	}

	return false;
}
