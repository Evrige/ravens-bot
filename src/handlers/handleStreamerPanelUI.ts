import {
	ActionRowBuilder,
	ButtonInteraction,
	GuildMember,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { FAMILY_OWNERS_ROLE_IDS } from "../config/staff";
import { CUSTOM_IDS } from "../constants/customIds";
import { prisma } from "../utils/prisma";
import {
	extractDiscordUserId,
	extractTwitchLogin,
	normalizeTwitchUrl,
} from "../utils/streamers";
import { upsertStreamerPanel } from "../services/upsertStreamerPanel";

function canManage(interaction: ButtonInteraction | ModalSubmitInteraction) {
	const member = interaction.member as GuildMember | null;
	return Boolean(
		member &&
		FAMILY_OWNERS_ROLE_IDS.some((roleId) => roleId && member.roles.cache.has(roleId))
	);
}

function input(params: {
	customId: string;
	label: string;
	placeholder?: string;
	required?: boolean;
}) {
	return new TextInputBuilder()
		.setCustomId(params.customId)
		.setLabel(params.label)
		.setPlaceholder(params.placeholder ?? "")
		.setStyle(TextInputStyle.Short)
		.setRequired(params.required ?? true);
}

function parseTableId(value: string) {
	const id = Number(value.trim());
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function showAddModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.STREAMER_MODAL_ADD)
		.setTitle("Добавить стримера")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_USER,
					label: "Discord ID или упоминание",
					placeholder: "123456789012345678 или @пользователь",
				})
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_URL,
					label: "Ссылка на Twitch",
					placeholder: "https://www.twitch.tv/login",
				})
			)
		);

	await interaction.showModal(modal);
}

async function showEditModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.STREAMER_MODAL_EDIT)
		.setTitle("Редактировать стримера")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_ID,
					label: "ID в таблице",
					placeholder: "Например: 4",
				})
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_USER,
					label: "Новый Discord ID (необязательно)",
					placeholder: "Оставьте пустым, чтобы не менять",
					required: false,
				})
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_URL,
					label: "Новая Twitch ссылка (необязательно)",
					placeholder: "Оставьте пустым, чтобы не менять",
					required: false,
				})
			)
		);

	await interaction.showModal(modal);
}

async function showDeleteModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.STREAMER_MODAL_DELETE)
		.setTitle("Удалить стримера")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				input({
					customId: CUSTOM_IDS.STREAMER_INPUT_ID,
					label: "ID в таблице",
					placeholder: "Например: 4",
				})
			)
		);

	await interaction.showModal(modal);
}

async function handleAdd(interaction: ModalSubmitInteraction) {
	const userId = extractDiscordUserId(
		interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_USER)
	);
	const twitchLogin = extractTwitchLogin(
		interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_URL)
	);

	if (!userId) {
		await interaction.reply({
			content: "❌ Укажите корректный Discord ID или упоминание.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!twitchLogin) {
		await interaction.reply({
			content: "❌ Укажите корректную ссылку на Twitch-канал.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const member = await interaction.guild?.members.fetch(userId).catch(() => null);
	if (!member) {
		await interaction.editReply("❌ Пользователь не найден на сервере.");
		return;
	}

	const guildId = interaction.guildId!;
	const duplicate = await prisma.streamer.findFirst({
		where: {
			guildId,
			OR: [{ discordUserId: userId }, { twitchLogin }],
		},
	});

	if (duplicate) {
		await interaction.editReply(`❌ Пользователь или Twitch-канал уже есть в таблице под ID **${duplicate.id}**.`);
		return;
	}

	await prisma.streamer.create({
		data: {
			guildId,
			discordUserId: userId,
			twitchLogin,
			twitchUrl: normalizeTwitchUrl(twitchLogin),
		},
	});

	await upsertStreamerPanel(interaction.client);
	await interaction.editReply(`✅ Стример <@${userId}> добавлен.`);
}

async function handleEdit(interaction: ModalSubmitInteraction) {
	const tableId = parseTableId(
		interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_ID)
	);
	if (!tableId) {
		await interaction.reply({
			content: "❌ Укажите корректный ID из таблицы.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const rawUser = interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_USER).trim();
	const rawUrl = interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_URL).trim();
	const userId = rawUser ? extractDiscordUserId(rawUser) : null;
	const twitchLogin = rawUrl ? extractTwitchLogin(rawUrl) : null;

	if (rawUser && !userId) {
		await interaction.reply({
			content: "❌ Новый Discord ID указан неверно.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (rawUrl && !twitchLogin) {
		await interaction.reply({
			content: "❌ Новая Twitch-ссылка указана неверно.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!userId && !twitchLogin) {
		await interaction.reply({
			content: "❌ Укажите нового пользователя или новую Twitch-ссылку.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const streamer = await prisma.streamer.findFirst({
		where: { id: tableId, guildId: interaction.guildId! },
	});
	if (!streamer) {
		await interaction.editReply("❌ Стример с таким ID не найден.");
		return;
	}

	if (userId) {
		const member = await interaction.guild?.members.fetch(userId).catch(() => null);
		if (!member) {
			await interaction.editReply("❌ Новый пользователь не найден на сервере.");
			return;
		}
	}

	const duplicate = await prisma.streamer.findFirst({
		where: {
			guildId: interaction.guildId!,
			id: { not: tableId },
			OR: [
				...(userId ? [{ discordUserId: userId }] : []),
				...(twitchLogin ? [{ twitchLogin }] : []),
			],
		},
	});
	if (duplicate) {
		await interaction.editReply(`❌ Такие данные уже используются записью ID **${duplicate.id}**.`);
		return;
	}

	await prisma.streamer.update({
		where: { id: tableId },
		data: {
			...(userId ? { discordUserId: userId } : {}),
			...(twitchLogin
				? {
					twitchLogin,
					twitchUrl: normalizeTwitchUrl(twitchLogin),
					isLive: false,
				}
				: {}),
		},
	});

	await upsertStreamerPanel(interaction.client);
	await interaction.editReply(`✅ Запись ID **${tableId}** обновлена.`);
}

async function handleDelete(interaction: ModalSubmitInteraction) {
	const tableId = parseTableId(
		interaction.fields.getTextInputValue(CUSTOM_IDS.STREAMER_INPUT_ID)
	);
	if (!tableId) {
		await interaction.reply({
			content: "❌ Укажите корректный ID из таблицы.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const streamer = await prisma.streamer.findFirst({
		where: { id: tableId, guildId: interaction.guildId! },
	});
	if (!streamer) {
		await interaction.editReply("❌ Стример с таким ID не найден.");
		return;
	}

	await prisma.streamer.delete({ where: { id: streamer.id } });
	await upsertStreamerPanel(interaction.client);
	await interaction.editReply(`✅ Запись ID **${tableId}** удалена.`);
}

export async function handleStreamerPanelUI(
	interaction: ButtonInteraction | ModalSubmitInteraction
) {
	const knownButton =
		interaction.isButton() &&
		[
			CUSTOM_IDS.STREAMER_PANEL_ADD,
			CUSTOM_IDS.STREAMER_PANEL_EDIT,
			CUSTOM_IDS.STREAMER_PANEL_DELETE,
		].includes(interaction.customId);
	const knownModal =
		interaction.isModalSubmit() &&
		[
			CUSTOM_IDS.STREAMER_MODAL_ADD,
			CUSTOM_IDS.STREAMER_MODAL_EDIT,
			CUSTOM_IDS.STREAMER_MODAL_DELETE,
		].includes(interaction.customId);

	if (!knownButton && !knownModal) return false;

	if (!canManage(interaction)) {
		await interaction.reply({
			content: "❌ У вас нет прав для управления стримерами.",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (interaction.isButton()) {
		if (interaction.customId === CUSTOM_IDS.STREAMER_PANEL_ADD) await showAddModal(interaction);
		if (interaction.customId === CUSTOM_IDS.STREAMER_PANEL_EDIT) await showEditModal(interaction);
		if (interaction.customId === CUSTOM_IDS.STREAMER_PANEL_DELETE) await showDeleteModal(interaction);
		return true;
	}

	if (interaction.customId === CUSTOM_IDS.STREAMER_MODAL_ADD) await handleAdd(interaction);
	if (interaction.customId === CUSTOM_IDS.STREAMER_MODAL_EDIT) await handleEdit(interaction);
	if (interaction.customId === CUSTOM_IDS.STREAMER_MODAL_DELETE) await handleDelete(interaction);
	return true;
}
