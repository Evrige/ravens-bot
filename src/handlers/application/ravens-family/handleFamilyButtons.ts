import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	GuildMember,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from "discord.js";
import { createButton } from "../../../components/createButton";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { openFamilyApplicationModal } from "./openFamilyApplicationModal";
import { processFamilyApplication } from "./processFamilyApplication";
import { config } from "../../../config/env";
import {FAMILY_HIGH_ROLE_IDS, FAMILY_RECRUIT_ROLE_IDS} from "../../../config/staff";
import { createPrivateChannel } from "../../../utils/createPrivateChannel";
import {prisma} from "../../../utils/prisma";

// --- Создание кнопок
export function buildFamilyButtons(applicationId: bigint, showCallButton = true) {
	const row = new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY}${applicationId}`,
				label: "Принять",
				style: ButtonStyle.Success
			}),
			createButton({
				customId: `${CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY}${applicationId}`,
				label: "Отклонить",
				style: ButtonStyle.Danger
			})
		);

	// Добавляем кнопку "Вызвать на обзвон" только если showCallButton = true
	if (showCallButton) {
		row.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY}${applicationId}`,
				label: "Вызвать на обзвон",
				style: ButtonStyle.Primary
			})
		);
	}

	return row;
}

// --- Удаление приватных каналов
async function deleteUserTicketChannels(guild: any, username: string) {
	const textChannel = guild.channels.cache.find((c: any) => c.name === `чат-${username}`);
	const voiceChannel = guild.channels.cache.find((c: any) => c.name === `обзвон-${username}`);

	if (textChannel) await textChannel.delete("Заявка принята/отклонена").catch(() => {});
	if (voiceChannel) await voiceChannel.delete("Заявка принята/отклонена").catch(() => {});
}

// --- Проверка прав для принятия/отклонения
function canModerate(interaction: any, clickedUserId: string) {
	const member = interaction.member as GuildMember;
	const hasRole = [
		...FAMILY_RECRUIT_ROLE_IDS.slice(1),
		...FAMILY_HIGH_ROLE_IDS
	].some(id => member.roles.cache.has(id));

	return hasRole || interaction.user.id === clickedUserId;
}

// --- Обработчик кнопок
export async function handleFamilyButtons(interaction: any) {
	// Открыть форму
	if (interaction.customId === CUSTOM_IDS.OPEN_FAMILY_APPLICATION) {
		return openFamilyApplicationModal(interaction);
	}

	// --- Принять / Отклонить
	if (
		interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY) ||
		interaction.customId.startsWith(CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY)
	) {
		const applicationId = interaction.customId
			.replace(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY, "")
			.replace(CUSTOM_IDS.FAMILY_DECLINE_APPLICATION_IN_FAMILY, "");

		const message = interaction.message;
		const embed = message.embeds[0];
		if (!embed) return;

		const clickedUserId = interaction.user.id;
		// Проверяем права
		if (!canModerate(interaction, clickedUserId)) {
			return interaction.reply({ content: "У вас нет прав на это действие ❌", ephemeral: true });
		}
		const application = await prisma.application.findUnique({
			where: { id: applicationId }
		});

		if (!application) {
			console.log("Заявка не найдена");
			return;
		}

		const userId = application.userId;
		const member = await interaction.guild.members.fetch(userId);
		const username = member.user.username;

		// Удаляем приватные каналы
		await deleteUserTicketChannels(interaction.guild, username);

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY)) {
			// обработка принятия заявки
			let nicknameFromApplication: string | undefined;
			const nameField = embed.fields.find((f: any) => f.name === CUSTOM_IDS.APPLICATION_FAMILY_NAME);
			if (nameField) nicknameFromApplication = nameField.value;
			await interaction.deferUpdate(); // ОБЯЗАТЕЛЬНО

			await processFamilyApplication(
				interaction,
				applicationId,
				true,
				undefined,
				nicknameFromApplication
			);

			await interaction.message.delete().catch(() => {});
			return;
		} else {
			// отклонение — открываем модальное окно
			const modal = new ModalBuilder()
				.setCustomId(`${CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY}${applicationId}`)
				.setTitle("Причина отклонения");

			const reasonInput = new TextInputBuilder()
				.setCustomId(CUSTOM_IDS.FAMILY_REASON_IN_FAMILY)
				.setLabel("Причина")
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
		  modal.setCustomId(`${CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY}${applicationId}_${interaction.message.id}`)
			return interaction.showModal(modal);
		}
	}

	// --- Вызвать на обзвон
	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY)) {
		const applicationId = interaction.customId.replace(CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY, "");

		const application = await prisma.application.findUnique({
			where: { id: applicationId },  // твой уникальный ID заявки
			select: { userId: true }       // выбираем только userId
		});

		const userId = application?.userId || ""
		const member = await interaction.guild.members.fetch(userId);
		const username = member.user.username;

		const categoryId = config.FAMILY_RECRUIT_CATEGORY_ID!;

		// создаём приватные каналы
		const textChannel = await createPrivateChannel({
			guild: interaction.guild,
			name: `чат-${username}`,
			type: 0,
			categoryId: categoryId,
			userId,
			clickedUserId: interaction.user.id, // сохраняем кто нажал на кнопку
			roleIds: FAMILY_RECRUIT_ROLE_IDS.slice(1),
		});

		if (textChannel && textChannel.isTextBased()) {
			await textChannel.send(`Привет <@${userId}>! Здесь будет ваш приватный чат для обзвона.`);
		}

		await createPrivateChannel({
			guild: interaction.guild,
			name: `обзвон-${username}`,
			type: ChannelType.GuildVoice,
			categoryId: categoryId,
			userId,
			clickedUserId: interaction.user.id,
			roleIds: FAMILY_RECRUIT_ROLE_IDS.slice(1)
		});

		// --- удаляем кнопку "Вызвать на обзвон" после нажатия
		const newComponents = buildFamilyButtons(applicationId, false); // showCallButton = false
		await interaction.update({ components: [newComponents] });
	}
}