// handleFamilySubmit.ts
import { CUSTOM_IDS } from "../../../constants/customIds";
import { buildFamilyEmbedFromModal } from "../../../utils/buildFamilyEmbedFromModal";
import { buildFamilyButtons } from "./handleFamilyButtons";
import { processFamilyApplication } from "./processFamilyApplication";
import { config } from "../../../config/env";
import { FAMILY_RECRUIT_ROLE_IDS } from "../../../config/staff";
import { prisma, getOrCreateUser } from "../../../utils/prisma";
import type { Application } from "@prisma/client";
import type { ModalSubmitInteraction } from "discord.js";

export async function handleFamilySubmit(interaction: ModalSubmitInteraction) {
	let application: Application | null = null;

	// -------------------- СОЗДАНИЕ НОВОЙ ЗАЯВКИ -------------------- //
	if (interaction.customId === CUSTOM_IDS.FAMILY_MODAL_NEW) {
		const embed = buildFamilyEmbedFromModal(interaction);

		// Получаем или создаём пользователя
		const user = await getOrCreateUser(interaction.user.id);

		// Создаём запись в базе
		application = await prisma.application.create({
			data: {
				userId: user.id,
				name: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_NAME),
				age: parseInt(interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_AGE)),
				target: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_TARGET),
				link: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_LINK),
				howToKnow: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW),
			}
		});

		// Канал для заявок
		const channelId = config.FAMILY_RECRUIT_CHANNEL_ID!;
		const appChannel = interaction.guild?.channels.cache.get(channelId);

		if (!appChannel?.isTextBased()) {
			return interaction.reply({ content: "Канал для заявок не найден ❌", ephemeral: true });
		}

		// Генерируем кнопки с applicationId
		const buttons = buildFamilyButtons(application.id);

		// Упоминания ролей
		const mentionText = FAMILY_RECRUIT_ROLE_IDS.map(id => `<@&${id}>`).join(" ");

		await appChannel.send({
			content: mentionText || undefined,
			embeds: [embed],
			components: [buttons]
		});

		return interaction.reply({ content: "✅ Ваша заявка отправлена, ожидайте.", ephemeral: true });
	}

	// -------------------- ОТКЛОНЕНИЕ ЗАЯВКИ -------------------- //
	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY)) {
		const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_REASON_IN_FAMILY);

		// Разделяем applicationId и messageId
		const data = interaction.customId.replace(CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY, "");
		const [applicationId, messageId] = data.split("_");

		if (!applicationId) {
			return interaction.reply({ content: "Ошибка: ID заявки не найден ❌", ephemeral: true });
		}

		// Находим заявку в базе
		const application = await prisma.application.findUnique({
			where: { id: +applicationId }
		});

		if (!application) {
			return interaction.reply({ content: "Ошибка: заявка не найдена ❌", ephemeral: true });
		}

		// Обновляем заявку в базе (можно добавить поле reason)
		await prisma.application.update({
			where: { id: +applicationId },
			data: { howToKnow: reason } // или поле reason
		});

		// Вызываем обработку заявки (отклонение)
		await processFamilyApplication(interaction, application.id, false, reason);

		// Удаляем оригинальное сообщение с кнопками
		if (messageId) {
			const message = await interaction.channel?.messages.fetch(messageId);
			await message?.delete().catch(() => {});
		}

		return;
	}
}