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
	createImprovementRequest,
	declineImprovementRequest,
	listRecentImprovementRequests,
	setImprovementRequestMessage,
} from "../services/familyHistoryStore";
import { formatDate, truncateText } from "../utils/formatters";

function isPositionRequest(requestKey: ImprovementRequestKey) {
	return requestKey === "recruit";
}

function buildRoleMentions() {
	if (!FAMILY_RECRUIT_ROLE_IDS.length) return "";
	return FAMILY_RECRUIT_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(" ");
}

function hasImprovementAccess(interaction: Interaction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_HIGH_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

const ROLE_NAME_ALIASES: Record<ImprovementRequestKey | "newbie" | "plum", string[]> = {
	young_londo: ["Young Ravens", "Young Londo"],
	londo: ["Ravens", "Londo"],
	main: ["Main"],
	maecenas: ["Maecenas"],
	recruit: ["Recruit"],
	newbie: ["Newbie"],
	plum: ["Plum"],
};

function findRoleIdByAliases(interaction: Interaction, aliases: string[]) {
	const guild = interaction.guild;
	if (!guild) return null;

	const normalizedAliases = aliases.map((name) => name.trim().toLowerCase());
	const role = guild.roles.cache.find((entry) =>
		normalizedAliases.includes(entry.name.trim().toLowerCase())
	);

	return role?.id ?? null;
}

function getTargetRoleId(interaction: Interaction, requestKey: ImprovementRequestKey) {
	const aliases = ROLE_NAME_ALIASES[requestKey];
	if (!aliases?.length) return null;

	return findRoleIdByAliases(interaction, aliases);
}

function getHierarchyRoleIds(interaction: Interaction) {
	const keys: Array<"newbie" | "plum" | ImprovementRequestKey> = [
		"newbie",
		"plum",
		"young_londo",
		"londo",
		"main",
	];

	return keys
		.map((key) => findRoleIdByAliases(interaction, ROLE_NAME_ALIASES[key]))
		.filter((roleId): roleId is string => Boolean(roleId));
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
			if (!hasImprovementAccess(interaction)) {
				await interaction.reply({
					content: "❌ У тебя нет прав на принятие этой заявки.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

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
			const applicationId = BigInt(applicationIdRaw);
			const roleId = getTargetRoleId(interaction, requestKey);

			if (!roleId) {
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

			if (!isPositionRequest(requestKey) && requestKey !== "maecenas") {
				const hierarchyRoles = getHierarchyRoleIds(interaction).filter((id) => member.roles.cache.has(id));
				if (hierarchyRoles.length) {
					await member.roles.remove(hierarchyRoles).catch(() => {});
				}
			}

			await member.roles.add(roleId).catch(() => {});

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
				interaction.guild?.roles.cache.get(roleId)?.name ?? "новая роль";
			await member.send(
				`✅ Ваша заявка **${IMPROVEMENT_REQUESTS[requestKey].label}** одобрена.\nВыдана роль: **${roleName}**.`
			).catch(() => {});

			return true;
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_IMPROVEMENT_DECLINE)) {
			if (!hasImprovementAccess(interaction)) {
				await interaction.reply({
					content: "❌ У тебя нет прав на отклонение этой заявки.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
				return true;
			}

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
		if (!hasImprovementAccess(interaction)) {
			await interaction.reply({
				content: "❌ У тебя нет прав на отклонение этой заявки.",
				flags: MessageFlags.Ephemeral,
			}).catch(() => {});
			return true;
		}

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
						name: "Имя пользователя",
						value: interaction.user.username,
						inline: true,
					},
					{
						name: "ID пользователя",
						value: interaction.user.id,
						inline: true,
					},
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
					text: `Improvement Application ID: ${createdRequest.id.toString()} | Applicant ID: ${interaction.user.id}`
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
				content: buildRoleMentions() || undefined,
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
