import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	GuildMember,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	Interaction
} from "discord.js";
import { createButton } from "../../../components/createButton";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { openFamilyApplicationModal } from "./openFamilyApplicationModal";
import { processFamilyApplication } from "./processFamilyApplication";
import { config } from "../../../config/env";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_RECRUIT_ROLE_IDS } from "../../../config/staff";
import { createPrivateChannel } from "../../../utils/createPrivateChannel";
import { prisma } from "../../../utils/prisma";

// --- Временная память для контроля кто нажал на обзвон
const callMap = new Map<string, string>(); // Map<applicationId, clickedUserId>

// --- Создание кнопок
export function buildFamilyButtons(applicationId: bigint, showCallButton = true) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

// --- Проверка прав
function canModerate(interaction: Interaction, clickedUserId: string) {
	const member = interaction.member as GuildMember;

	const hasRole = [
		...FAMILY_RECRUIT_ROLE_IDS.slice(1),
		...FAMILY_HIGH_ROLE_IDS].some(id =>
		member.roles.cache.has(id)
	);

	// Если есть роли — можно
	if (hasRole) return true;

	// Если пользователь нажал на обзвон — можно
	if (interaction.user.id === clickedUserId) return true;

	return false;
}

// --- Обработчик кнопок
export async function handleFamilyButtons(interaction: any) {
	// --- Открыть форму заявки
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

		// --- Определяем кто может модерать (для обзвона)
		const clickedUserId = callMap.get(applicationId) || ""; // если обзвон был — там будет ID

		if (!canModerate(interaction, clickedUserId)) {
			return interaction.reply({ content: "У вас нет прав на это действие ❌", ephemeral: true });
		}

		const message = interaction.message;
		const embed = message.embeds[0];
		if (!embed) return;

		const application = await prisma.application.findUnique({ where: { id: applicationId } });
		if (!application) return interaction.reply({ content: "Заявка не найдена ❌", ephemeral: true });

		const userId = application.userId;
		const member = await interaction.guild.members.fetch(userId);
		const username = member.user.username;

		// Удаляем приватные каналы
		await deleteUserTicketChannels(interaction.guild, username);

		if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_ACCEPT_APPLICATION_IN_FAMILY)) {
			// --- Принять заявку
			let nicknameFromApplication: string | undefined;
			const nameField = embed.fields.find((f: any) => f.name === CUSTOM_IDS.APPLICATION_FAMILY_NAME);
			if (nameField) nicknameFromApplication = nameField.value;

			await interaction.deferUpdate();

			await processFamilyApplication(interaction, applicationId, true, undefined, nicknameFromApplication);

			// удаляем кнопку и запись о обзвоне
			callMap.delete(applicationId);
			await interaction.message.delete().catch(() => {});
			return;
		} else {
			// --- Отклонить заявку — открываем модал
			const modal = new ModalBuilder()
				.setCustomId(`${CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY}${applicationId}_${interaction.message.id}`)
				.setTitle("Причина отклонения");

			const reasonInput = new TextInputBuilder()
				.setCustomId(CUSTOM_IDS.FAMILY_REASON_IN_FAMILY)
				.setLabel("Причина")
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

			return interaction.showModal(modal);
		}
	}

	// --- Вызвать на обзвон
	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY)) {
		const applicationId = interaction.customId.replace(CUSTOM_IDS.FAMILY_CALL_APPLICATION_IN_FAMILY, "");

		const application = await prisma.application.findUnique({
			where: { id: applicationId },
			select: { userId: true }
		});

		if (!application) return;

		const userId = application.userId;
		const member = await interaction.guild.members.fetch(userId);
		const username = member.user.username;

		const categoryId = config.FAMILY_RECRUIT_CATEGORY_ID!;

		// --- Создаём приватные каналы
		await createPrivateChannel({
			guild: interaction.guild,
			name: `чат-${username}`,
			type: ChannelType.GuildText,
			categoryId,
			userId,
			clickedUserId: interaction.user.id, // сохраняем кто нажал на обзвон
			roleIds: FAMILY_RECRUIT_ROLE_IDS.slice(1)
		});

		await createPrivateChannel({
			guild: interaction.guild,
			name: `обзвон-${username}`,
			type: ChannelType.GuildVoice,
			categoryId,
			userId,
			clickedUserId: interaction.user.id,
			roleIds: FAMILY_RECRUIT_ROLE_IDS.slice(1)
		});

		// --- Сохраняем кто нажал на обзвон
		callMap.set(applicationId, interaction.user.id);

		// --- Убираем кнопку "Вызвать на обзвон"
		const newComponents = buildFamilyButtons(applicationId, false);
		await interaction.update({ components: [newComponents] });
	}
}