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
import { FAMILY_OWNERS_ROLE_IDS } from "../config/staff";
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

const PROMO_REGISTER_URL = "https://majestic-rp.ru/register?utm_campaign=senticee";
const PROMO_EXAMPLE_URL = "https://youtu.be/uf-6T81xxVI";
const PROMO_CODE = "SENTICEE";

function hasOwnerAccess(interaction: { member?: unknown }) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_OWNERS_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function buildDecisionButtons(requestId: bigint, disabled = false) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.FAMILY_PROMO_COMPLETE}${requestId.toString()}`)
			.setLabel("Выполнено")
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.FAMILY_PROMO_DECLINE}${requestId.toString()}`)
			.setLabel("Не выполнено")
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

async function getPromoChannel(interaction: ButtonInteraction) {
	const channel = await interaction.client.channels.fetch(CHANNEL_IDS.FAMILY_PROMO).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;
	return channel;
}

function buildPromoDeclineModal(requestId: bigint) {
	const modal = new ModalBuilder()
		.setCustomId(`${CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL}${requestId.toString()}`)
		.setTitle("Причина отклонения");

	const input = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_PROMO_DECLINE_REASON_INPUT)
		.setLabel("Причина")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setPlaceholder("Укажите причину отклонения промо-заявки.");

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

async function createPromoThread(interaction: ButtonInteraction) {
	const channel = await getPromoChannel(interaction);
	if (!channel) {
		await interaction.reply({
			content: "❌ Промо-канал не найден.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const existingRequest = await getActivePromoRequestByUser(interaction.user.id);
	if (existingRequest) {
		await interaction.reply({
			content: `ℹ️ У вас уже есть активная заявка: <#${existingRequest.threadId}>`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const londestRole = findFamilyRankRole(interaction.guild!, "maecenas");
	if (londestRole && (interaction.member as any)?.roles?.cache?.has?.(londestRole.id)) {
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
		name: `promo-${sanitizeThreadName(displayName) || interaction.user.id}`,
		type: ChannelType.PrivateThread,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		invitable: false,
		reason: `Промо-заявка ${interaction.user.id}`,
	}).catch(() => null);

	if (!thread) {
		await interaction.editReply("❌ Не удалось создать приватную ветку для промо.");
		return true;
	}

	await thread.members.add(interaction.user.id).catch(() => {});
	await cleanupPromoSystemMessages(thread);

	const ownerMentions = FAMILY_OWNERS_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(" ");
	const introMessage = await thread.send({
		content: [
			`${interaction.user} ${ownerMentions} Привет! Пожалуйста, предоставь видеозапись доказательства активации промокода \`${PROMO_CODE}\`.`,
			"**Регистрация:**",
			`• Перейдите по ссылке: ${PROMO_REGISTER_URL}`,
			`• Либо введи команду на сервере: \`/promo senticee\``,
			"Обязательно должны быть видны статик персонажа и название сервера.",
			`[Пример идеального доказательства](${PROMO_EXAMPLE_URL})`,
		].join("\n"),
		components: [buildDecisionButtons(0n, true)],
	}).catch(() => null);

	await cleanupPromoSystemMessages(thread);

	const request = await createPromoRequest({
		userId: interaction.user.id,
		promoCode: PROMO_CODE,
		channelId: channel.id,
		threadId: thread.id,
		requestMessageId: introMessage?.id ?? null,
	});

	if (!request) {
		await interaction.editReply("⚠️ Таблица промо-заявок в БД пока недоступна. Примени миграцию Prisma.");
		return true;
	}

	if (introMessage) {
		await introMessage.edit({
			content: introMessage.content,
			components: [buildDecisionButtons(request.id)],
		}).catch(() => {});
	}

	await logPromo(
		interaction,
		"Новая промо-заявка",
		`${interaction.user} создал промо-заявку в ветке <#${thread.id}>.`,
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
	if (!hasOwnerAccess(interaction)) {
		await interaction.reply({
			content: "❌ Только владельцы семьи могут обрабатывать промо-заявки.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const request = await getPromoRequest(requestId);
	if (!request) {
		await interaction.reply({
			content: "❌ Промо-заявка не найдена.",
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
			content: "ℹ️ Эта промо-заявка уже обработана.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const thread = await interaction.client.channels.fetch(request.threadId).catch(() => null);
	const member = await interaction.guild?.members.fetch(request.userId).catch(() => null);

	if (completed && member) {
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
				reason: "Промокод SENTICEE подтверждён владельцем семьи",
				moderatorId: interaction.user.id,
				source: "PROMO_REQUEST",
				applicantUsername: member.user.username,
				applicantDisplayName: member.displayName,
			}).catch(() => {});
		}

		await prisma.user.upsert({
			where: { id: member.id },
			update: { balance: { increment: 50000 } },
			create: { id: member.id, balance: 50000 as any },
		}).catch(() => {});
	}

	if (thread?.isThread()) {
		const requestMessage =
			request.requestMessageId
				? await thread.messages.fetch(request.requestMessageId).catch(() => null)
				: null;

		if (requestMessage) {
			await requestMessage.edit({
				content: requestMessage.content,
				components: [buildDecisionButtons(requestId, true)],
			}).catch(() => {});
		}

		await thread.send(
			completed
				? `✅ Заявка подтверждена владельцем <@${interaction.user.id}>. Ранг **Londest Londo** и бонус **50.000$** выданы.`
				: `❌ Заявка отклонена владельцем <@${interaction.user.id}>.\nПричина: ${declineReason ?? "Не указана"}`
		).catch(() => {});
	}

	const user = await interaction.client.users.fetch(request.userId).catch(() => null);
	await user?.send(
		completed
			? "✅ Ваша промо-заявка подтверждена. Вам выданы ранг Londest Londo и бонус 50.000$."
			: `❌ Ваша промо-заявка не была подтверждена.\nПричина: ${declineReason ?? "Не указана"}.`
	).catch(() => {});

	await logPromo(
		interaction,
		completed ? "Промо-заявка подтверждена" : "Промо-заявка отклонена",
		completed
			? `Кто обработал: <@${interaction.user.id}>\nПринял заявку у: ${user ?? `<@${request.userId}>`}`
			: `Кто обработал: <@${interaction.user.id}>\nОтклонил заявку у: ${user ?? `<@${request.userId}>`}\nПричина: ${declineReason ?? "Не указана"}`,
		completed ? 0x57f287 : 0xed4245
	);

	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(
			completed ? "✅ Промо-заявка подтверждена." : "✅ Промо-заявка отклонена."
		).catch(() => {});
	} else {
		await interaction.reply({
			content: completed ? "✅ Промо-заявка подтверждена." : "✅ Промо-заявка отклонена.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
	}

	if (thread?.isThread()) {
		await thread.delete(
			completed
				? `Промо-заявка ${requestId.toString()} подтверждена`
				: `Промо-заявка ${requestId.toString()} отклонена`
		).catch(() => {});
	}

	return true;
}

export async function handleFamilyPromoUI(interaction: ButtonInteraction) {
	if (interaction.customId === CUSTOM_IDS.FAMILY_PROMO_REQUEST) {
		return createPromoThread(interaction);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_COMPLETE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_PROMO_COMPLETE.length));
		return resolvePromo(interaction, id, true);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_DECLINE)) {
		const id = BigInt(interaction.customId.slice(CUSTOM_IDS.FAMILY_PROMO_DECLINE.length));
		if (!hasOwnerAccess(interaction)) {
			await interaction.reply({
				content: "❌ Только владельцы семьи могут обрабатывать промо-заявки.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

		await interaction.showModal(buildPromoDeclineModal(id)).catch(() => {});
		return true;
	}

	return false;
}

export async function handleFamilyPromoModal(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith(CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL)) {
		return false;
	}

	if (!hasOwnerAccess(interaction as any)) {
		await interaction.reply({
			content: "❌ Только владельцы семьи могут обрабатывать промо-заявки.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const requestId = BigInt(
		interaction.customId.slice(CUSTOM_IDS.FAMILY_PROMO_DECLINE_MODAL.length)
	);
	const reason = interaction.fields
		.getTextInputValue(CUSTOM_IDS.FAMILY_PROMO_DECLINE_REASON_INPUT)
		.trim();

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
	return resolvePromo(interaction, requestId, false, reason);
}
