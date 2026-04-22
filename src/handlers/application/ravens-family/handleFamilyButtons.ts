import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	GuildMember,
	Interaction,
	ModalBuilder,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
	EmbedBuilder,
} from "discord.js";
import { createButton } from "../../../components/createButton";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { openFamilyApplicationModal } from "./openFamilyApplicationModal";
import { processFamilyApplication } from "./processFamilyApplication";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_RECRUIT_ROLE_IDS } from "../../../config/staff";
import { prisma } from "../../../utils/prisma";
import { ensureFamilyTicketChannels } from "./familyTicketChannels";

function toBigInt(id: string) {
	return BigInt(id);
}

export function buildFamilyButtons(applicationId: bigint, showCallButton = true) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		createButton({
			customId: `${CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
			label: "Принять",
			style: ButtonStyle.Success,
		}),
		createButton({
			customId: `${CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
			label: "Отклонить",
			style: ButtonStyle.Danger,
		})
	);

	if (showCallButton) {
		row.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY}${applicationId.toString()}`,
				label: "Вызвать на обзвон",
				style: ButtonStyle.Primary,
			})
		);
	}

	return row;
}

function hasAnyRole(member: GuildMember, roleIds: string[]) {
	return roleIds.some((id) => member.roles.cache.has(id));
}

function hasFirstRecruitRole(member: GuildMember) {
	const firstRole = FAMILY_RECRUIT_ROLE_IDS[0];
	return !!firstRole && member.roles.cache.has(firstRole);
}

function hasRecruitRolesExceptFirst(member: GuildMember) {
	return FAMILY_RECRUIT_ROLE_IDS.slice(1).some((id) => member.roles.cache.has(id));
}

function hasHighRoles(member: GuildMember) {
	return FAMILY_HIGH_ROLE_IDS.some((id) => member.roles.cache.has(id));
}

async function canModerateApplication(interaction: Interaction, applicationId: bigint) {
	const member = interaction.member as GuildMember;
	if (!member) return false;

	const application = await prisma.application.findUnique({
		where: { id: applicationId },
		select: {
			callTakenById: true,
		},
	});

	if (!application) return false;

	const callTakenById = application.callTakenById;

	// Пока никто не взял на обзвон — могут все нужные роли
	if (!callTakenById) {
		return hasAnyRole(member, [...FAMILY_RECRUIT_ROLE_IDS, ...FAMILY_HIGH_ROLE_IDS]);
	}

	// После взятия на обзвон:
	// 1) high роли могут всегда
	if (hasHighRoles(member)) return true;

	// 2) recruit роли кроме первой могут всегда
	if (hasRecruitRolesExceptFirst(member)) return true;

	// 3) первая recruit роль — только если именно этот человек взял на обзвон
	if (hasFirstRecruitRole(member) && interaction.user.id === callTakenById) return true;

	return false;
}

function appendCallTakenField(embed: EmbedBuilder, moderatorId: string) {
	const json = embed.toJSON();

	const filteredFields = (json.fields ?? []).filter((f) => f.name !== "📞 Кто взял на обзвон");

	return EmbedBuilder.from({
		...json,
		fields: [
			...filteredFields,
			{
				name: "📞 Кто взял на обзвон",
				value: `<@${moderatorId}>`,
				inline: false,
			},
		],
	});
}

export async function handleFamilyButtons(interaction: any) {
	if (interaction.customId === CUSTOM_IDS.OPEN_FAMILY_APPLICATION) {
		return openFamilyApplicationModal(interaction);
	}

	if (
		interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY) ||
		interaction.customId.startsWith(CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY)
	) {
		const applicationIdRaw = interaction.customId
			.replace(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY, "")
			.replace(CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY, "");

		const applicationId = BigInt(applicationIdRaw);

		const allowed = await canModerateApplication(interaction, applicationId);
		if (!allowed) {
			return interaction.reply({
				content: "У вас нет прав на это действие ❌",
				ephemeral: true,
			});
		}

		const message = interaction.message;
		const embed = message?.embeds?.[0];
		if (!embed) {
			return interaction.reply({
				content: "Embed заявки не найден ❌",
				ephemeral: true,
			});
		}

		const application = await prisma.application.findUnique({
			where: { id: applicationId },
		});

		if (!application) {
			return interaction.reply({
				content: "Заявка не найдена ❌",
				ephemeral: true,
			});
		}

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY)) {
			let nicknameFromApplication: string | undefined;
			const nameField = embed.fields.find((f: any) => f.name === CUSTOM_IDS.APPLICATION_FAMILY_NAME);
			if (nameField) nicknameFromApplication = nameField.value;

			await interaction.deferUpdate();

			await processFamilyApplication(
				interaction,
				applicationId,
				true,
				undefined,
				nicknameFromApplication
			);

			await interaction.message.delete().catch(() => {});
			return;
		}

		const modal = new ModalBuilder()
			.setCustomId(
				`${CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY}${applicationId.toString()}_${interaction.message.id}`
			)
			.setTitle("Причина отклонения");

		const reasonInput = new TextInputBuilder()
			.setCustomId(CUSTOM_IDS.FAMILY_REASON_IN_FAMILY)
			.setLabel("Причина")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

		return interaction.showModal(modal);
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY)) {
		const applicationIdRaw = interaction.customId.replace(
			CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY,
			""
		);
		const applicationId = toBigInt(applicationIdRaw);

		const application = await prisma.application.findUnique({
			where: { id: applicationId },
			select: {
				id: true,
				userId: true,
				callTakenById: true,
			},
		});

		if (!application) {
			return interaction.reply({
				content: "Заявка не найдена ❌",
				ephemeral: true,
			});
		}

		if (application.callTakenById) {
			return interaction.reply({
				content: `Эта заявка уже взята на обзвон пользователем <@${application.callTakenById}>.`,
				ephemeral: true,
			});
		}

		const userId = application.userId;
		const member = await interaction.guild.members.fetch(userId).catch(() => null);

		if (!member) {
			return interaction.reply({
				content: "Пользователь не найден на сервере ❌",
				ephemeral: true,
			});
		}

		const username = member.user.username;
		const { textChannel } = await ensureFamilyTicketChannels({
			guild: interaction.guild,
			username,
			userId,
			clickedUserId: interaction.user.id,
			roleIds: FAMILY_RECRUIT_ROLE_IDS.slice(1),
		});

		await prisma.application.update({
			where: { id: applicationId },
			data: {
				callTakenById: interaction.user.id,
				callTakenAt: new Date(),
			},
		});

		const originalEmbed = interaction.message.embeds[0];
		const updatedEmbed = appendCallTakenField(EmbedBuilder.from(originalEmbed.toJSON()), interaction.user.id);

		const newComponents = buildFamilyButtons(applicationId, false);

		await interaction.update({
			embeds: [updatedEmbed],
			components: [newComponents],
		});

		let introSent = false;
		if (textChannel) {
			await textChannel.send({
				content:
					`<@${userId}> здравствуйте!\n\n` +
					`Это ваш личный канал для рассмотрения заявки в семью.\n` +
					`На данный момент вашей заявкой занимается <@${interaction.user.id}>.\n` +
					`Пожалуйста, ожидайте дальнейшей связи здесь или в голосовом канале обзвона.`,
				embeds: [updatedEmbed],
				components: [buildFamilyButtons(applicationId, false)],
			}).then(() => {
				introSent = true;
			}).catch((error) => {
				console.error("family call intro send error:", error);
			});
		}

		if (!introSent) {
			await member.send(
				`<@${userId}> здравствуйте!\n\n` +
				`Ваша заявка взята на обзвон пользователем <@${interaction.user.id}>.\n` +
				`Если приватный канал не появился, напишите рекрутеру напрямую или повторно зайдите на сервер.`
			).catch(() => {});
		}

		return;
	}
}
