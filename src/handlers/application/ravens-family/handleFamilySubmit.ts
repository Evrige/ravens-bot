import { CUSTOM_IDS } from "../../../constants/customIds";
import { buildFamilyEmbedFromModal } from "../../../utils/buildFamilyEmbedFromModal";
import { buildFamilyButtons } from "./handleFamilyButtons";
import { processFamilyApplication } from "./processFamilyApplication";
import { config } from "../../../config/env";
import { FAMILY_RECRUIT_ROLE_IDS } from "../../../config/staff";
import { prisma, getOrCreateUser } from "../../../utils/prisma";
import {MessageFlags, ModalSubmitInteraction} from "discord.js";
import { Application } from "../../../generated/prisma/client";

export async function handleFamilySubmit(interaction: ModalSubmitInteraction) {
	if (interaction.customId === CUSTOM_IDS.FAMILY_MODAL_NEW) {
		const embed = buildFamilyEmbedFromModal(interaction);

		const ageRaw = interaction.fields.getTextInputValue(
			CUSTOM_IDS.APPLICATION_FAMILY_AGE
		).trim();

		if (!/^\d+$/.test(ageRaw)) {
			return interaction.reply({
				content: "❌ Возраст должен быть указан числом (например: 18).",
				ephemeral: true,
			});
		}

		const age = Number(ageRaw);
		if (age < 14 || age > 100) {
			return interaction.reply({
				content: "❌ Укажите корректный возраст.",
				ephemeral: true,
			});
		}

		const user = await getOrCreateUser(interaction.user.id);

		// Историю получаем ДО создания новой заявки
		const applicationHistory = await prisma.application.findMany({
			where: { userId: user.id },
			orderBy: { createdAt: "desc" },
		});

		const application = await prisma.application.create({
			data: {
				userId: user.id,
				name: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_NAME),
				age,
				target: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_TARGET),
				link: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_LINK),
				howToKnow: interaction.fields.getTextInputValue(CUSTOM_IDS.APPLICATION_FAMILY_HOW_TO_KNOW),
			},
		});

		const channelId = config.FAMILY_RECRUIT_CHANNEL_ID!;
		const appChannel = interaction.guild?.channels.cache.get(channelId);

		if (!appChannel?.isTextBased()) {
			return interaction.reply({
				content: "Канал для заявок не найден ❌",
				ephemeral: true,
			});
		}

		const buttons = buildFamilyButtons(application.id);
		const mentionText = FAMILY_RECRUIT_ROLE_IDS.map((id) => `<@&${id}>`).join(" ");

		let historyText = "";
		if (applicationHistory.length > 0) {
			historyText = applicationHistory
				.map((app: Application) => {
					let statusEmoji = "🟡";
					let statusText = "На рассмотрении";

					if (app.isAccepted === true) {
						statusEmoji = "🟢";
						statusText = "Одобрена";
					} else if (app.isAccepted === false && app.reason) {
						statusEmoji = "🔴";
						statusText = "Отклонена";
					}

					const dateStr = app.createdAt.toLocaleDateString("ru-RU");
					const reasonText =
						app.isAccepted === false ? ` — Причина: ${app.reason || "не указана"}` : "";

					return `${statusEmoji} ${dateStr} — ${statusText}${reasonText}`;
				})
				.join("\n");
		} else {
			historyText = "Старых заявок не найдено.";
		}

		const sentMessage = await appChannel.send({
			content: `${mentionText}\n\n**История заявок пользователя:**\n${historyText}`,
			embeds: [embed],
			components: [buttons]
		});

		await prisma.application.update({
			where: { id: application.id },
			data: {
				sourceMessageUrl: sentMessage.url,
			},
		});

		return interaction.reply({
			content: "✅ Ваша заявка отправлена, ожидайте.",
			ephemeral: true,
		});
	}

	if (interaction.customId.startsWith(CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY)) {
		const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_REASON_IN_FAMILY).trim();

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const data = interaction.customId.replace(CUSTOM_IDS.FAMILY_DECLINE_REASON_IN_FAMILY, "");
		const [applicationIdRaw, messageId] = data.split("_");

		if (!applicationIdRaw) {
			return interaction.reply({
				content: "Ошибка: ID заявки не найден ❌",
				ephemeral: true,
			});
		}

		const applicationId = BigInt(applicationIdRaw);

		const application = await prisma.application.findUnique({
			where: { id: applicationId },
		});

		if (!application) {
			return interaction.reply({
				content: "Ошибка: заявка не найдена ❌",
				ephemeral: true,
			});
		}

		await prisma.application.update({
			where: { id: applicationId },
			data: { reason },
		});

		await processFamilyApplication(interaction, application.id, false, reason);

		if (messageId) {
			const message = await interaction.channel?.messages.fetch(messageId).catch(() => null);
			await message?.delete().catch(() => {});
		}

		return;
	}
}