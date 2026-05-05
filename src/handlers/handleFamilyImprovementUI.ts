import {
	ActionRowBuilder,
	APIEmbed,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	Interaction,
	ModalSubmitInteraction,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	IMPROVEMENT_REQUESTS,
	ImprovementRequestKey,
} from "../config/familyImprovementSystem";
import { CHANNEL_IDS } from "../config/channels";
import {
	FAMILY_HIGH_ROLE_IDS,
	FAMILY_RECRUIT_ROLE_IDS,
} from "../config/staff";
import {
	acceptImprovementRequest,
	createRankHistoryEntry,
	createImprovementRequest,
	declineImprovementRequest,
	listRecentImprovementRequests,
	setImprovementRequestMessage,
} from "../services/familyHistoryStore";
import { formatDate, truncateText } from "../utils/formatters";
import { applyFamilyRankChange, FamilyRankKey, findFamilyRankRole } from "../services/familyRanks";

function isPositionRequest(requestKey: ImprovementRequestKey) {
	return requestKey === "recruit";
}

function buildRoleMentions(requestKey: ImprovementRequestKey) {
	const roleIds = isPositionRequest(requestKey)
		? FAMILY_HIGH_ROLE_IDS
		: Array.from(new Set([...FAMILY_RECRUIT_ROLE_IDS, ...FAMILY_HIGH_ROLE_IDS]));

	if (!roleIds.length) return "";
	return roleIds.map((roleId) => `<@&${roleId}>`).join(" ");
}

function hasImprovementAccess(interaction: Interaction, requestKey: ImprovementRequestKey) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	if (isPositionRequest(requestKey)) {
		return FAMILY_HIGH_ROLE_IDS.some((roleId) => roleCache.has(roleId));
	}

	return [...FAMILY_RECRUIT_ROLE_IDS, ...FAMILY_HIGH_ROLE_IDS].some((roleId) =>
		roleCache.has(roleId)
	);
}

function buildDecisionButtons(
	requestKey: ImprovementRequestKey,
	applicantId: string,
	applicationId: bigint,
	disabled = false
) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(
				`${CUSTOM_IDS.FAMILY_IMPROVEMENT_ACCEPT}${requestKey}:${applicantId}:${applicationId.toString()}`
			)
			.setLabel("Принять")
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(
				`${CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE}${requestKey}:${applicantId}:${applicationId.toString()}`
			)
			.setLabel("Отклонить")
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled)
	);
}

function buildDeclineModal(
	requestKey: ImprovementRequestKey,
	applicantId: string,
	applicationId: bigint,
	messageId: string
) {
	const modal = new ModalBuilder()
		.setCustomId(
			`${CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE_MODAL}${requestKey}:${applicantId}:${applicationId.toString()}:${messageId}`
		)
		.setTitle("Причина отклонения");

	const input = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE_REASON_INPUT)
		.setLabel("Причина")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setPlaceholder("Укажите причину отклонения.");

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
	return modal;
}

function buildUpdatedEmbeds(options: {
	infoEmbed: APIEmbed;
	requestEmbed: APIEmbed;
	accepted: boolean;
	moderatorId: string;
	reason?: string;
}) {
	const nextInfoEmbed = EmbedBuilder.from(options.infoEmbed);
	const nextRequestEmbed = EmbedBuilder.from(options.requestEmbed)
		.setColor(options.accepted ? 0x57f287 : 0xed4245)
		.addFields({
			name: options.accepted ? "Статус" : "Отклонено",
			value: options.accepted
				? `Принято модератором <@${options.moderatorId}>`
				: `Отклонено модератором <@${options.moderatorId}>`,
			inline: false,
		});

	if (!options.accepted && options.reason) {
		nextRequestEmbed.addFields({
			name: "Причина",
			value: options.reason,
			inline: false,
		});
	};

	return [nextInfoEmbed, nextRequestEmbed];
}

async function getPreviousApplications(targetChannel: any, applicantId: string) {
	const requests = await listRecentImprovementRequests(applicantId, 5);

	return requests.map((request) => {
		const link = request.messageUrl ? `[Заявка](${request.messageUrl})` : "Заявка";
		return `${link} — ${request.label} | ${formatDate(request.createdAt)}`;
	});
}

function buildImprovementModal(requestKey: ImprovementRequestKey) {
	const request = IMPROVEMENT_REQUESTS[requestKey];

	const modal = new ModalBuilder()
		.setCustomId(`${CUSTOM_IDS.FAMILY_IMPROVEMENT_REQUEST_MODAL}${requestKey}`)
		.setTitle(request.label);

	const linkOrTextInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_IMPROVEMENT_NICKNAME_INPUT)
		.setLabel("Ссылка")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setPlaceholder("Оставьте ссылку на скриншот, доказательство или нужный материал.");

	const reasonInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_IMPROVEMENT_REASON_INPUT)
		.setLabel("Текст заявки")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setPlaceholder("Коротко опишите вашу заявку на должность.");

	if (isPositionRequest(requestKey)) {
		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				reasonInput
			)
		);
		return modal;
	}

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(linkOrTextInput)
	);

	return modal;
}

export async function handleFamilyImprovementUI(interaction: Interaction) {
	if (interaction.isButton()) {
		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_IMPROVEMENT_ACCEPT)) {
			const payload = interaction.customId.slice(CUSTOM_IDS.FAMILY_IMPROVEMENT_ACCEPT.length);
			const [requestKeyRaw, applicantId, applicationIdRaw] = payload.split(":");
			if (!applicationIdRaw) {
				await interaction.reply({
					content: "ℹ️ Это старая заявка без записи в БД. Создай новую заявку, чтобы обработать её корректно.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
			const requestKey = requestKeyRaw as ImprovementRequestKey;
			if (!hasImprovementAccess(interaction, requestKey)) {
				await interaction.reply({
					content: isPositionRequest(requestKey)
						? "❌ Заявки на Recruit могут обрабатывать только high staff."
						: "❌ У тебя нет прав на принятие этой заявки.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
			const applicationId = BigInt(applicationIdRaw);
			const targetRole = interaction.guild
				? findFamilyRankRole(interaction.guild, requestKey as FamilyRankKey)
				: null;

			if (!targetRole) {
				await interaction.reply({
					content: "❌ Для этой заявки не настроена целевая роль.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const member = await interaction.guild?.members.fetch(applicantId).catch(() => null);
			if (!member) {
				await interaction.reply({
					content: "❌ Пользователь не найден на сервере.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const storedRequest = await acceptImprovementRequest(applicationId, interaction.user.id);
			if (!storedRequest) {
				await interaction.reply({
					content: "ℹ️ Эта заявка уже обработана или не найдена в истории.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const rankChange = await applyFamilyRankChange(
				member,
				requestKey as FamilyRankKey,
				"PROMOTE"
			);

			if (!rankChange) {
				await interaction.reply({
					content: "❌ Не удалось применить изменение ранга.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			if (rankChange.changed) {
				await createRankHistoryEntry({
					userId: member.id,
					action: "PROMOTE",
					rankKey: rankChange.rankKey,
					rankLabel: rankChange.rankLabel,
					targetRoleId: rankChange.targetRoleId,
					targetRoleName: rankChange.targetRoleName,
					beforeRanks: rankChange.beforeRanks.join(", "),
					afterRanks: rankChange.afterRanks.join(", "),
					reason: storedRequest.content,
					moderatorId: interaction.user.id,
					source: "IMPROVEMENT_REQUEST",
					relatedImprovementRequestId: storedRequest.id,
					applicantUsername: storedRequest.applicantUsername,
					applicantDisplayName: storedRequest.applicantDisplayName,
				}).catch(() => {});
			}

			const infoEmbed = interaction.message.embeds[0]?.toJSON();
			const requestEmbed = interaction.message.embeds[1]?.toJSON();
			if (!infoEmbed || !requestEmbed) {
				await interaction.reply({
					content: "❌ Не удалось прочитать заявку.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
			const updatedEmbeds = buildUpdatedEmbeds({
				infoEmbed,
				requestEmbed,
				accepted: true,
				moderatorId: interaction.user.id,
			});

			await interaction.update({
				embeds: updatedEmbeds,
				components: [buildDecisionButtons(requestKey, applicantId, applicationId, true)],
			}).catch(() => {});

			const roleName =
				targetRole.name ?? "новая роль";
			await member.send(
				`✅ Ваша заявка **${IMPROVEMENT_REQUESTS[requestKey].label}** одобрена.\nВыдана роль: **${roleName}**.`
			).catch(() => {});

			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE)) {
			const payload = interaction.customId.slice(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE.length);
			const [requestKeyRaw, applicantId, applicationIdRaw] = payload.split(":");
			if (!applicationIdRaw) {
				await interaction.reply({
					content: "ℹ️ Это старая заявка без записи в БД. Создай новую заявку, чтобы обработать её корректно.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
			const requestKey = requestKeyRaw as ImprovementRequestKey;
			if (!hasImprovementAccess(interaction, requestKey)) {
				await interaction.reply({
					content: isPositionRequest(requestKey)
						? "❌ Заявки на Recruit могут обрабатывать только high staff."
						: "❌ У тебя нет прав на отклонение этой заявки.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}
			const applicationId = BigInt(applicationIdRaw);

			await interaction.showModal(
				buildDeclineModal(requestKey, applicantId, applicationId, interaction.message.id)
			);
			return true;
		}
	}

	if (
		interaction.isStringSelectMenu() &&
		interaction.customId === CUSTOM_IDS.FAMILY_IMPROVEMENT_REQUEST_SELECT
	) {
		const requestKey = interaction.values[0] as ImprovementRequestKey;
		if (!IMPROVEMENT_REQUESTS[requestKey]) return true;

		await interaction.showModal(buildImprovementModal(requestKey));
		return true;
	}

	if (interaction.isModalSubmit() && interaction.customId.startsWith(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE_MODAL)) {
		const payload = interaction.customId.slice(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE_MODAL.length);
		const [requestKeyRaw, applicantId, applicationIdRaw, messageId] = payload.split(":");
		if (!applicationIdRaw) {
			await interaction.reply({
				content: "ℹ️ Это старая заявка без записи в БД.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}
		const requestKey = requestKeyRaw as ImprovementRequestKey;
		if (!hasImprovementAccess(interaction, requestKey)) {
			await interaction.reply({
				content: isPositionRequest(requestKey)
					? "❌ Заявки на Recruit могут обрабатывать только high staff."
					: "❌ У тебя нет прав на отклонение этой заявки.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}
		const applicationId = BigInt(applicationIdRaw);
		const reason = interaction.fields
			.getTextInputValue(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE_REASON_INPUT)
			.trim();

		await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

		const message = await interaction.channel?.messages.fetch(messageId).catch(() => null);
		if (!message || message.embeds.length < 2) {
			await interaction.editReply("❌ Не удалось найти сообщение заявки.");
			return true;
		}

		const infoEmbed = message.embeds[0]?.toJSON();
		const requestEmbed = message.embeds[1]?.toJSON();
		if (!infoEmbed || !requestEmbed) {
			await interaction.editReply("❌ Не удалось прочитать embed заявки.");
			return true;
		}
		const storedRequest = await declineImprovementRequest(applicationId, interaction.user.id, reason);
		if (!storedRequest) {
			await interaction.editReply("ℹ️ Эта заявка уже обработана или не найдена в истории.");
			return true;
		}

		const updatedEmbeds = buildUpdatedEmbeds({
			infoEmbed,
			requestEmbed,
			accepted: false,
			moderatorId: interaction.user.id,
			reason,
		});

		await message.edit({
			embeds: updatedEmbeds,
			components: [buildDecisionButtons(requestKey, applicantId, applicationId, true)],
		}).catch(() => {});

		const targetUser = await interaction.client.users.fetch(applicantId).catch(() => null);
		await targetUser?.send(
			`❌ Ваша заявка **${IMPROVEMENT_REQUESTS[requestKey].label}** отклонена.\nПричина: ${reason}`
		).catch(() => {});

		await interaction.editReply("✅ Заявка отклонена.");
		return true;
	}

	if (
		interaction.isModalSubmit() &&
		interaction.customId.startsWith(CUSTOM_IDS.FAMILY_IMPROVEMENT_REQUEST_MODAL)
	) {
		const requestKey = interaction.customId.slice(
			CUSTOM_IDS.FAMILY_IMPROVEMENT_REQUEST_MODAL.length
		) as ImprovementRequestKey;
		const request = IMPROVEMENT_REQUESTS[requestKey];
		if (!request) return true;

		const reason = isPositionRequest(requestKey)
			? interaction.fields
					.getTextInputValue(CUSTOM_IDS.FAMILY_IMPROVEMENT_REASON_INPUT)
					.trim()
			: null;
		const linkOrText = isPositionRequest(requestKey)
			? null
			: interaction.fields
					.getTextInputValue(CUSTOM_IDS.FAMILY_IMPROVEMENT_NICKNAME_INPUT)
					.trim();

		const targetChannel = await interaction.client.channels
			.fetch(CHANNEL_IDS.FAMILY_IMPROVEMENT_APPLICATIONS)
			.catch(() => null);

		if (targetChannel && targetChannel.isTextBased() && "send" in targetChannel && "messages" in targetChannel) {
			const member = interaction.guild?.members.cache.get(interaction.user.id)
				?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
			const previousApplications = await getPreviousApplications(targetChannel, interaction.user.id);
			const createdRequest = await createImprovementRequest({
				userId: interaction.user.id,
				requestKey,
				label: request.label,
				content: (isPositionRequest(requestKey) ? reason : linkOrText) || "Не указано",
				applicantUsername: interaction.user.username,
				applicantDisplayName: member?.displayName ?? interaction.user.username,
				applicantRegisteredAt: interaction.user.createdAt,
				applicantJoinedAt: member?.joinedAt ?? null,
			});
			if (!createdRequest) {
				await interaction.reply({
					content: "⚠️ История повышений в БД пока недоступна. Примени миграцию Prisma и попробуй снова.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

			const infoEmbed = new EmbedBuilder()
				.setColor(0x2f3136)
				.setTitle("Информация о заявителе")
				.setThumbnail(interaction.user.displayAvatarURL())
				.addFields(
					{
						name: "Дата регистрации",
						value: formatDate(interaction.user.createdAt),
						inline: true,
					},
					{
						name: "Дата вступления",
						value: formatDate(member?.joinedAt),
						inline: false,
					},
					{
						name: "Прошлые заявки на повышение",
						value: previousApplications.length
							? previousApplications.join("\n")
							: "Прошлых заявок не найдено.",
						inline: false,
					}
				)
				.setFooter({
					text: `Improvement Application ID: ${createdRequest.id.toString()}`
				});

			const requestEmbed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle(request.label)
				.addFields({
					name: isPositionRequest(requestKey) ? "Текст заявки" : "Ссылка",
					value: truncateText((isPositionRequest(requestKey) ? reason : linkOrText) || "Не указано"),
				})
				.setTimestamp();

			const sentMessage = await targetChannel.send({
				content: [buildRoleMentions(requestKey), interaction.user.toString()].filter(Boolean).join(" "),
				embeds: [infoEmbed, requestEmbed],
				components: [buildDecisionButtons(requestKey, interaction.user.id, createdRequest.id)],
			}).catch(() => null);

			if (sentMessage) {
				await setImprovementRequestMessage(createdRequest.id, {
					channelId: sentMessage.channelId,
					messageId: sentMessage.id,
					messageUrl: sentMessage.url,
				}).catch(() => {});
			}
		}

		await interaction.reply({
			content: "✅ Заявка отправлена в канал повышений.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	return false;
}
