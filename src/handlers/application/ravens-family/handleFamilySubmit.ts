// handleFamilySubmit.ts
import { CUSTOM_IDS } from "../../../constants/customIds";
import { buildFamilyEmbedFromModal } from "../../../utils/buildFamilyEmbedFromModal";
import { buildFamilyButtons } from "./handleFamilyButtons";
import { processFamilyApplication } from "./processFamilyApplication";
import { config } from "../../../config/env";
import { FAMILY_RECRUIT_ROLE_IDS } from "../../../config/staff";
import { prisma, getOrCreateUser } from "../../../utils/prisma";
import type { ModalSubmitInteraction } from "discord.js";
import {Application} from "../../../generated/prisma/client";

export async function handleFamilySubmit(interaction: ModalSubmitInteraction) {
	let application: Application | null = null;

	// -------------------- СОЗДАНИЕ НОВОЙ ЗАЯВКИ -------------------- //
	if (interaction.customId === CUSTOM_IDS.FAMILY_MODAL_NEW) {
		const embed = buildFamilyEmbedFromModal(interaction);

		const ageRaw = interaction.fields.getTextInputValue(
			CUSTOM_IDS.APPLICATION_FAMILY_AGE
		).trim();

		// Проверка: только цифры
		if (!/^\d+$/.test(ageRaw)) {
			return interaction.reply({
				content: "❌ Возраст должен быть указан числом (например: 18).",
				ephemeral: true
			});
		}
		const age = Number(ageRaw);

		// Дополнительная проверка диапазона (по желанию)
		if (age < 14 || age > 100) {
			return interaction.reply({
				content: "❌ Укажите корректный возраст.",
				ephemeral: true
			});
		}
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

		// Получаем историю заявок пользователя
		const applicationHistory = await prisma.application.findMany({
			where: { userId: user.id },
			orderBy: { createdAt: 'desc' } // чтобы последние были сверху
		});

		let historyText = '';
		if (applicationHistory.length > 0) {
			historyText = applicationHistory.map((app: Application) => {
				const statusEmoji = app.isAccepted ? '🟢' : '🔴';
				const dateStr = app.createdAt.toLocaleDateString('ru-RU');
				const reason = app.isAccepted ? '' : ` — Причина: ${app.reason || 'не указана'}`;
				return `${statusEmoji} ${dateStr}${reason}`;
			}).join('\n');
		} else {
			historyText = 'Старых заявок не найдено.';
		}


// Отправляем сначала текст истории, затем embed
		await appChannel.send({
			content: `${mentionText || ''}\n${historyText}`,
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

		// Обновляем заявку в базе
		await prisma.application.update({
			where: { id: +applicationId },
			data: { reason }
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