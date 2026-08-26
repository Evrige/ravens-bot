import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	PrivateThreadChannel,
	PublicThreadChannel,
	TextInputBuilder,
	TextInputStyle,
	ThreadAutoArchiveDuration,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import { CHANNEL_IDS } from "../config/channels";
import { FAMILY_OWNER_ROLE_IDS } from "../config/staff";
import {
	createPromoRequest,
	createRankHistoryEntry,
	getActivePromoRequestByUser,
	getPromoRequest,
	resolvePromoRequest,
} from "../services/familyHistoryStore";
import { findFamilyRankRole, applyFamilyRankChange } from "../services/familyRanks";
import { prisma } from "../utils/prisma";
import { sendFamilyAuditCustomEmbed } from "../services/startFamilyAuditLogger";

const LONDEST_PAYMENT_AMOUNT = "350.000$";
const LONDEST_PAYMENT_MARKER = "FAMILY_ACCOUNT_350000";
const MEDIA_REQUEST_MARKER = "FAMILY_MEDIA_REQUEST";

type RequestKind = "promo" | "media";

const REQUEST_META: Record<RequestKind, {
	marker: string;
	threadPrefix: string;
	displayName: string;
	createReason: string;
	activeMessage: string;
	notFoundMessage: string;
	accessMessage: string;
	logBucket: "promo";
}> = {
	promo: {
		marker: LONDEST_PAYMENT_MARKER,
		threadPrefix: "londest",
		displayName: "Londest Londo",
		createReason: "Заявка Londest Londo",
		activeMessage: "У вас уже есть активная заявка Londest Londo",
		notFoundMessage: "Заявка Londest Londo не найдена.",
		accessMessage: "Только владельцы семьи могут обрабатывать заявки Londest Londo.",
		logBucket: "promo",
	},
	media: {
		marker: MEDIA_REQUEST_MARKER,
		threadPrefix: "media",
		displayName: "медиа",
		createReason: "Заявка на медиа",
		activeMessage: "У вас уже есть активная заявка на медиа",
		notFoundMessage: "Заявка на медиа не найдена.",
		accessMessage: "Только владельцы семьи могут обрабатывать заявки на медиа.",
		logBucket: "promo",
	},
};

function hasOwnerAccess(interaction: { member?: unknown }) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_OWNER_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function buildDecisionButtons(requestId: bigint, disabled = false, kind: RequestKind = "promo") {
	const completeId = kind === "media" ? CUSTOM_IDS.FAMILY_MEDIA_COMPLETE : CUSTOM_IDS.FAMILY_PROMO_COMPLETE;
	const declineId = kind === "media" ? CUSTOM_IDS.FAMILY_MEDIA_DECLINE : CUSTOM_IDS.FAMILY_PROMO_DECLINE;

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${completeId}${requestId.toString()}`)
			.setLabel(kind === "media" ? "Принять" : "Выполнено")
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(`${declineId}${requestId.toString()}`)
			.setLabel(kind === "media" ? "Отклонить" : "Не выполнено")
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled)
	);
}

function sanitizeThreadName(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-zа-яё0-9_-]+/gi, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 75);
}

async function getRequestChannel(interaction: ButtonInteraction, kind: RequestKind = "promo") {
	const channelId = kind === "media" ? CHANNEL_IDS.FAMILY_MEDIA : CHANNEL_IDS.FAMILY_PROMO;
	const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel;
}

function buildPromoDeclineModal(requestId: bigint, kind: RequestKind = "promo") {
	const modalId = kind === "media" ? CUSTOM_IDS.FAMILY_MEDIA_DECLINE_MODAL : CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL;
	const modal = new ModalBuilder()
		.setCustomId(`${modalId}${requestId.toString()}`)
		.setTitle("Причина отклонения");

	const input = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_PROMO_DECLINE_REASON_INPUT)
		.setLabel("Причина")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setPlaceholder("Укажите причину отклонения заявки.");

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(input)
	);

	return modal;
}

async function logPromo(
	interaction: ButtonInteraction | ModalSubmitInteraction,
	title: string,
	description: string,
	color: number
) {
	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(title)
		.setDescription(description)
		.setTimestamp();

	await sendFamilyAuditCustomEmbed(interaction.client, "promo", embed).catch(() => {});
}

async function cleanupPromoSystemMessages(
	thread: PrivateThreadChannel | PublicThreadChannel<boolean>
) {
	const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
	if (!messages) return;

	await Promise.all(
		(Array.from(messages.values()) as Array<{ system: boolean; delete: () => Promise<unknown> }>).map(async (message) => {
			if (!message.system) return;
			await message.delete().catch(() => {});
		})
	);
}

function buildIntroContent(kind: RequestKind, userMention: string, ownerMentions: string) {
	if (kind === "media") {
		return [
			`${userMention} ${ownerMentions} Привет! Расскажи немного о себе и своих медиа-площадках.`,
			"**Что нужно указать:**",
			"• кто ты и почему хочешь стать медиа Londo",
			"• ссылки на YouTube / Twitch / TikTok",
			"• количество подписчиков и средние просмотры",
			"• какой контент снимаешь или планируешь снимать",
			"• сколько времени готов уделять контенту",
		].join("\n");
	}

	return [
		`${userMention} ${ownerMentions} Привет! Пожалуйста, предоставь доказательство пополнения счёта семьи на **${LONDEST_PAYMENT_AMOUNT}**.`,
		"**Что должно быть видно на доказательстве:**",
		"• сумма пополнения",
		"• статик или никнейм персонажа",
	].join("\n");
}

async function createPromoThread(interaction: ButtonInteraction, kind: RequestKind = "promo") {
	const meta = REQUEST_META[kind];
	const channel = await getRequestChannel(interaction, kind);
	if (!channel) {
		await interaction.reply({
			content: `❌ Канал заявок ${meta.displayName} не найден.`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const existingRequest = await getActivePromoRequestByUser(interaction.user.id, meta.marker);
	if (existingRequest) {
		await interaction.reply({
			content: `ℹ️ ${meta.activeMessage}: <#${existingRequest.threadId}>`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const londestRole = kind === "promo" ? findFamilyRankRole(interaction.guild!, "maecenas") : null;
	if (kind === "promo" && londestRole && (interaction.member as any)?.roles?.cache?.has?.(londestRole.id)) {
		await interaction.reply({
			content: "ℹ️ У вас уже есть ранг Londest Londo.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
	const displayName = member?.displayName ?? interaction.user.username;

	const thread = await channel.threads.create({
		name: `${meta.threadPrefix}-${sanitizeThreadName(displayName) || interaction.user.id}`,
		type: ChannelType.PrivateThread,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		invitable: false,
		reason: `${meta.createReason} ${interaction.user.id}`,
	}).catch(() => null);

	if (!thread) {
		await interaction.editReply("❌ Не удалось создать приватную ветку для заявки.");
		return true;
	}

	const addedToThread = await thread.members.add(interaction.user.id).then(() => true).catch(() => false);
	if (!addedToThread) {
		await thread.delete("Не удалось добавить автора заявки в ветку Londest Londo").catch(() => {});
		await interaction.editReply(
			"❌ Не удалось выдать вам доступ к ветке заявки. Проверь права на форумы/ветки у этой роли и канала."
		);
		return true;
	}

	const threadMember = await thread.members.fetch(interaction.user.id).catch(() => null);
	if (!threadMember) {
		await thread.delete("Автор заявки не появился в списке участников ветки Londest Londo").catch(() => {});
		await interaction.editReply(
			"❌ Discord не добавил вас в ветку заявки. Скорее всего, проблема в правах канала или веток."
		);
		return true;
	}

	await cleanupPromoSystemMessages(thread);

	const ownerMentions = FAMILY_OWNER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(" ");
	const introMessage = await thread.send({
		content: buildIntroContent(kind, interaction.user.toString(), ownerMentions),
		components: [buildDecisionButtons(0n, true, kind)],
	}).catch(() => null);

	await cleanupPromoSystemMessages(thread);

	const request = await createPromoRequest({
		userId: interaction.user.id,
		promoCode: meta.marker,
		channelId: channel.id,
		threadId: thread.id,
		requestMessageId: introMessage?.id ?? null,
	});

	if (!request) {
		await interaction.editReply("⚠️ Таблица заявок в БД пока недоступна. Примени миграцию Prisma.");
		return true;
	}

	if (introMessage) {
		await introMessage.edit({
			content: introMessage.content,
			components: [buildDecisionButtons(request.id, false, kind)],
		}).catch(() => {});
	}

	await logPromo(
		interaction,
		kind === "media" ? "Новая заявка на медиа" : "Новая заявка Londest Londo",
		kind === "media"
			? `${interaction.user} создал заявку на медиа в ветке <#${thread.id}>.`
			: `${interaction.user} создал заявку на Londest Londo за взнос **${LONDEST_PAYMENT_AMOUNT}** в ветке <#${thread.id}>.`,
		0x5865f2
	);

	await interaction.editReply(`✅ Ветка создана: <#${thread.id}>`);
	return true;
}

async function resolvePromo(
	interaction: ButtonInteraction | ModalSubmitInteraction,
	requestId: bigint,
	completed: boolean,
	declineReason?: string
) {
	const request = await getPromoRequest(requestId);
	const kind: RequestKind = request?.promoCode === MEDIA_REQUEST_MARKER ? "media" : "promo";
	const meta = REQUEST_META[kind];

	if (!hasOwnerAccess(interaction)) {
		await interaction.reply({
			content: `❌ ${meta.accessMessage}`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (!request) {
		await interaction.reply({
			content: `❌ ${meta.notFoundMessage}`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const resolved = await resolvePromoRequest(
		requestId,
		completed ? "COMPLETED" : "DECLINED",
		interaction.user.id
	);
	if (!resolved) {
		await interaction.reply({
			content: "ℹ️ Эта заявка уже обработана.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const thread = await interaction.client.channels.fetch(request.threadId).catch(() => null);
	const member = await interaction.guild?.members.fetch(request.userId).catch(() => null);

	if (kind === "promo" && completed && member) {
		const result = await applyFamilyRankChange(member, "maecenas", "PROMOTE");
		if (result?.changed) {
			await createRankHistoryEntry({
				userId: member.id,
				action: "PROMOTE",
				rankKey: result.rankKey,
				rankLabel: result.rankLabel,
				targetRoleId: result.targetRoleId,
				targetRoleName: result.targetRoleName,
				beforeRanks: result.beforeRanks.join(", "),
				afterRanks: result.afterRanks.join(", "),
				reason: `Взнос ${LONDEST_PAYMENT_AMOUNT} на счёт семьи подтверждён владельцем семьи`,
				moderatorId: interaction.user.id,
				source: "LONDEST_PAYMENT_REQUEST",
				applicantUsername: member.user.username,
				applicantDisplayName: member.displayName,
			}).catch(() => {});
		}
	}

	if (thread?.isThread()) {
		const requestMessage =
			request.requestMessageId
				? await thread.messages.fetch(request.requestMessageId).catch(() => null)
				: null;

		if (requestMessage) {
			await requestMessage.edit({
				content: requestMessage.content,
				components: [buildDecisionButtons(requestId, true, kind)],
			}).catch(() => {});
		}

		await thread.send(
			kind === "media"
				? (completed
					? `✅ Заявка на медиа принята владельцем <@${interaction.user.id}>.`
					: `❌ Заявка на медиа отклонена владельцем <@${interaction.user.id}>.\nПричина: ${declineReason ?? "Не указана"}`)
				: completed
				? `✅ Заявка подтверждена владельцем <@${interaction.user.id}>. Ранг **Londest Londo** выдан за взнос **${LONDEST_PAYMENT_AMOUNT}**.`
				: `❌ Заявка отклонена владельцем <@${interaction.user.id}>.\nПричина: ${declineReason ?? "Не указана"}`
		).catch(() => {});
	}

	const user = await interaction.client.users.fetch(request.userId).catch(() => null);
	await user?.send(
		kind === "media"
			? (completed
				? "✅ Ваша заявка на медиа принята. С вами свяжутся в ближайшее время."
				: `❌ Ваша заявка на медиа отклонена.\nПричина: ${declineReason ?? "Не указана"}.`)
			: completed
			? `✅ Ваша заявка подтверждена. Вам выдан ранг Londest Londo за взнос ${LONDEST_PAYMENT_AMOUNT} на счёт семьи.`
			: `❌ Ваша заявка на Londest Londo не была подтверждена.\nПричина: ${declineReason ?? "Не указана"}.`
	).catch(() => {});

	await logPromo(
		interaction,
		kind === "media"
			? (completed ? "Заявка на медиа принята" : "Заявка на медиа отклонена")
			: (completed ? "Заявка Londest Londo подтверждена" : "Заявка Londest Londo отклонена"),
		kind === "media"
			? (completed
				? `Кто обработал: <@${interaction.user.id}>\nПринял медиа-заявку у: ${user ?? `<@${request.userId}>`}`
				: `Кто обработал: <@${interaction.user.id}>\nОтклонил медиа-заявку у: ${user ?? `<@${request.userId}>`}\nПричина: ${declineReason ?? "Не указана"}`)
			: completed
			? `Кто обработал: <@${interaction.user.id}>\nПринял заявку у: ${user ?? `<@${request.userId}>`}\nВзнос: **${LONDEST_PAYMENT_AMOUNT}**`
			: `Кто обработал: <@${interaction.user.id}>\nОтклонил заявку у: ${user ?? `<@${request.userId}>`}\nПричина: ${declineReason ?? "Не указана"}`,
		completed ? 0x57f287 : 0xed4245
	);

	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(
			completed ? "✅ Заявка подтверждена." : "✅ Заявка отклонена."
		).catch(() => {});
	} else {
		await interaction.reply({
			content: completed ? "✅ Заявка подтверждена." : "✅ Заявка отклонена.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
	}

	if (thread?.isThread()) {
		await thread.delete(
			kind === "media"
				? `Заявка на медиа ${requestId.toString()} ${completed ? "принята" : "отклонена"}`
				: completed
				? `Заявка Londest Londo ${requestId.toString()} подтверждена`
				: `Заявка Londest Londo ${requestId.toString()} отклонена`
		).catch(() => {});
	}

	return true;
}

export async function handleFamilyPromoUI(interaction: ButtonInteraction) {
	if (interaction.customId === CUSTOM_IDS.FAMILY_PROMO_REQUEST) {
		return createPromoThread(interaction, "promo");
	}

	if (interaction.customId === CUSTOM_IDS.FAMILY_MEDIA_REQUEST) {
		return createPromoThread(interaction, "media");
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_COMPLETE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_PROMO_COMPLETE.length));
		return resolvePromo(interaction, id, true);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_DECLINE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_PROMO_DECLINE.length));
		if (!hasOwnerAccess(interaction)) {
			await interaction.reply({
				content: "❌ Только владельцы семьи могут обрабатывать заявки Londest Londo.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.showModal(buildPromoDeclineModal(id, "promo")).catch(() => {});
		return true;
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_MEDIA_COMPLETE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_MEDIA_COMPLETE.length));
		return resolvePromo(interaction, id, true);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_MEDIA_DECLINE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_MEDIA_DECLINE.length));
		if (!hasOwnerAccess(interaction)) {
			await interaction.reply({
				content: "❌ Только владельцы семьи могут обрабатывать заявки на медиа.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.showModal(buildPromoDeclineModal(id, "media")).catch(() => {});
		return true;
	}

	return false;
}

export async function handleFamilyPromoModal(interaction: ModalSubmitInteraction) {
	const isPromoDecline = interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL);
	const isMediaDecline = interaction.customId.startsWith(CUSTOM_IDS.FAMILY_MEDIA_DECLINE_MODAL);
	if (!isPromoDecline && !isMediaDecline) {
		return false;
	}

	if (!hasOwnerAccess(interaction as any)) {
		await interaction.reply({
			content: isMediaDecline
				? "❌ Только владельцы семьи могут обрабатывать заявки на медиа."
				: "❌ Только владельцы семьи могут обрабатывать заявки Londest Londo.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const requestId = BigInt(
		interaction.customId.slice(
			isMediaDecline
				? CUSTOM_IDS.FAMILY_MEDIA_DECLINE_MODAL.length
				: CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL.length
		)
	);
	const reason = interaction.fields
		.getTextInputValue(CUSTOM_IDS.FAMILY_PROMO_DECLINE_REASON_INPUT)
		.trim();

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
	return resolvePromo(interaction, requestId, false, reason);
}
