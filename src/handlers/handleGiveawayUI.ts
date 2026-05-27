import {
	ActionRowBuilder,
	ButtonInteraction,
	Interaction,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	buildEndedGiveawaySelect,
	buildEndedGiveawaySelectOptions,
	createGiveaway,
	finalizeGiveaway,
	parseGiveawayEndTime,
	refreshGiveawayState,
	rerollGiveaway,
	syncGiveawayMessage,
} from "../services/giveawayService";
import { getGiveawayById, mutateGiveaways } from "../utils/giveawayStore";
import { FAMILY_HIGH_ROLE_IDS } from "../config/staff";

function hasGiveawayManageAccess(interaction: Interaction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_HIGH_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function buildCreateGiveawayModal() {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_CREATE)
		.setTitle("Создание розыгрыша");

	const prizeInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_PRIZE)
		.setLabel("Приз")
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(200);

	const extraInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_EXTRA)
		.setLabel("Картинка URL и ID роли")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setPlaceholder("https://...\n123456789012345678")
		.setMaxLength(500);

	const conditionsInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_CONDITIONS)
		.setLabel("Условия")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setMaxLength(500);

	const winnersInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_WINNERS)
		.setLabel("Количество победителей")
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setPlaceholder("например: 1");

	const endTimeInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.GIVEAWAY_MODAL_END_TIME)
		.setLabel("Время окончания")
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setPlaceholder("18:30 27.09.2025");

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(prizeInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(extraInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(conditionsInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(winnersInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(endTimeInput),
	);

	return modal;
}

function normalizeRoleId(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const mentionMatch = trimmed.match(/^<@&(\d+)>$/);
	const rawId = mentionMatch?.[1] ?? trimmed;
	return /^\d{15,25}$/.test(rawId) ? rawId : null;
}

function parseGiveawayExtraField(raw: string) {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	let imageUrl: string | null = null;
	let roleId: string | null = null;

	for (const line of lines) {
		if (!imageUrl && /^https?:\/\//i.test(line)) {
			imageUrl = line;
			continue;
		}

		const normalizedRoleId = normalizeRoleId(line);
		if (!roleId && normalizedRoleId) {
			roleId = normalizedRoleId;
			continue;
		}

		return {
			ok: false as const,
			error: "❌ В поле доп. параметров укажи ссылку на картинку и/или ID роли, каждое значение с новой строки.",
		};
	}

	return {
		ok: true as const,
		imageUrl,
		roleId,
	};
}

async function memberHasRequiredGiveawayRole(interaction: ButtonInteraction, roleId: string) {
	const guild = interaction.guild;
	if (!guild) return false;

	const cachedMember = (interaction.member as any)?.roles?.cache;
	if (cachedMember?.has?.(roleId)) return true;

	const member = await guild.members.fetch(interaction.user.id).catch(() => null);
	return !!member?.roles.cache.has(roleId);
}

async function handleJoinGiveaway(interaction: ButtonInteraction) {
	const giveawayId = interaction.customId.slice(CUSTOM_IDS.GIVEAWAY_JOIN.length);
	const giveaway = await getGiveawayById(giveawayId);

	if (!giveaway) {
		await interaction.reply({
			content: "❌ Этот giveaway уже не найден.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (giveaway.ended || new Date(giveaway.endAt).getTime() <= Date.now()) {
		await finalizeGiveaway(interaction.client, giveaway.id);
		await interaction.reply({
			content: "⏰ Время розыгрыша уже истекло, участие закрыто.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (giveaway.participants.includes(interaction.user.id)) {
		await interaction.reply({
			content: "ℹ️ Ты уже участвуешь в этом giveaway.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (giveaway.roleId) {
		const hasRequiredRole = await memberHasRequiredGiveawayRole(interaction, giveaway.roleId);
		if (!hasRequiredRole) {
			await interaction.reply({
				content: `❌ Участвовать в этом giveaway могут только участники с ролью <@&${giveaway.roleId}>.`,
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}
	}

	let updated = giveaway;
	await mutateGiveaways((records) => {
		const existing = records.find((record) => record.id === giveaway.id);
		if (!existing) return;
		existing.participants.push(interaction.user.id);
		updated = { ...existing };
	});

	await syncGiveawayMessage(interaction.client, updated);
	await refreshGiveawayState(interaction.client, giveaway.id);

	await interaction.reply({
		content: `✅ Ты участвуешь в giveaway **${updated.prize}**.`,
		flags: MessageFlags.Ephemeral,
	}).catch(() => {});

	return true;
}

export async function handleGiveawayUI(interaction: Interaction) {
	if (interaction.isButton()) {
		if (interaction.customId.startsWith(CUSTOM_IDS.GIVEAWAY_JOIN)) {
			return handleJoinGiveaway(interaction);
		}

		if (interaction.customId === CUSTOM_IDS.GIVEAWAY_PANEL_CREATE) {
			if (!hasGiveawayManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять розыгрышами может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.showModal(buildCreateGiveawayModal()).catch(() => {});
			return true;
		}

		if (interaction.customId === CUSTOM_IDS.GIVEAWAY_PANEL_REROLL) {
			if (!hasGiveawayManageAccess(interaction)) {
				await interaction.reply({
					content: "❌ Управлять розыгрышами может только старший состав.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const options = await buildEndedGiveawaySelectOptions();
			if (!options.length) {
				await interaction.reply({
					content: "ℹ️ Завершённых розыгрышей для реролла пока нет.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			await interaction.reply({
				content: "Выбери завершённый розыгрыш для реролла:",
				components: [new ActionRowBuilder<any>().addComponents(buildEndedGiveawaySelect(options))],
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}
	}

	if (
		interaction.isStringSelectMenu() &&
		interaction.customId === CUSTOM_IDS.GIVEAWAY_PANEL_REROLL_SELECT
	) {
		if (!hasGiveawayManageAccess(interaction)) {
			await interaction.reply({
				content: "❌ Управлять розыгрышами может только старший состав.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		const giveawayId = interaction.values[0];
		const rerolled = await rerollGiveaway(interaction.client, giveawayId);
		if (!rerolled) {
			await interaction.update({
				content: "❌ Не удалось выполнить реролл.",
				components: [],
			}).catch(() => {});
			return true;
		}

		await interaction.update({
			content: `✅ Реролл выполнен для **${rerolled.prize}**.`,
			components: [],
		}).catch(() => {});
		return true;
	}

	if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.GIVEAWAY_MODAL_CREATE) {
		if (!hasGiveawayManageAccess(interaction)) {
			await interaction.reply({
				content: "❌ Управлять розыгрышами может только старший состав.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		const prize = interaction.fields.getTextInputValue(CUSTOM_IDS.GIVEAWAY_MODAL_PRIZE).trim();
		const extraRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.GIVEAWAY_MODAL_EXTRA).trim();
		const conditions = interaction.fields.getTextInputValue(CUSTOM_IDS.GIVEAWAY_MODAL_CONDITIONS).trim();
		const winnersRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.GIVEAWAY_MODAL_WINNERS).trim();
		const endTimeRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.GIVEAWAY_MODAL_END_TIME).trim();
		const extraParsed = parseGiveawayExtraField(extraRaw);
		const winnersCount = Number(winnersRaw);
		const endAt = parseGiveawayEndTime(endTimeRaw);

		if (!extraParsed.ok) {
			await interaction.reply({
				content: extraParsed.error,
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		const { imageUrl, roleId } = extraParsed;

		if (!prize) {
			await interaction.reply({
				content: "❌ Укажи приз розыгрыша.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		if (!conditions) {
			await interaction.reply({
				content: "❌ Укажи условия участия.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 20) {
			await interaction.reply({
				content: "❌ Количество победителей должно быть от 1 до 20.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		if (!endAt || endAt.getTime() <= Date.now()) {
			await interaction.reply({
				content: "❌ Не удалось распознать время окончания. Используй один из поддерживаемых форматов.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		if (roleId) {
			const role = interaction.guild?.roles.cache.get(roleId)
				?? await interaction.guild?.roles.fetch(roleId).catch(() => null);

			if (!role) {
				await interaction.reply({
					content: "❌ Роль с таким ID не найдена на сервере.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

		const created = await createGiveaway(interaction.client, {
			creatorId: interaction.user.id,
			guildId: interaction.guildId ?? "",
			prize,
			imageUrl,
			description: conditions,
			winnersCount,
			endAt,
			roleId,
		});

		if (!created.ok) {
			await interaction.editReply("❌ Не удалось найти канал для публикации розыгрыша.");
			return true;
		}

		await interaction.editReply(
			`✅ Розыгрыш создан и отправлен в <#${created.channelId}>.${roleId ? ` Ограничение по роли: <@&${roleId}>.` : " Доступ: @everyone."}`
		);
		return true;
	}

	return false;
}
