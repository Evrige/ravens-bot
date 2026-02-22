// processFamilyApplication.ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { FAMILY_USER_ROLE_IDS } from "../../../config/staff";
import { config } from "../../../config/env";

export async function processFamilyApplication(
	interaction: any,
	applicationId: bigint,
	accepted: boolean,
	reason?: string,
	nicknameFromApplication?: string
) {
	try {
		const RecruitLogID = config.FAMILY_RECRUIT_LOG_ID;
		const moderator = interaction.user;

		// Получаем конкретную заявку по уникальному ID
		const application = await prisma.application.findUnique({
			where: { id: applicationId }
		});

		if (!application) {
			console.error("Заявка не найдена в базе", applicationId);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Заявка не найдена ❌", ephemeral: true });
			}
			return;
		}

		// Обновляем заявку: recruitId только если принята
		await prisma.application.update({
			where: { id: applicationId },
			data: {
				isAccepted: accepted,
				recruitId: moderator.id
			}
		});

		// --- Логируем полную заявку
		let resultEmbed: EmbedBuilder;

// Если interaction.message есть (для кнопок)
		if (interaction.message?.embeds[0]) {
			// Копируем весь оригинальный embed
			const originalEmbed = interaction.message.embeds[0].toJSON();
			resultEmbed = EmbedBuilder.from(originalEmbed)
				.setColor(accepted ? "Green" : "Red");

			// Добавляем поле с модератором
			resultEmbed.addFields({
				name: accepted ? "✅ Принял" : "❌ Отклонил",
				value: `<@${moderator.id}>`,
				inline: false
			});

			// Если отклонение, добавляем причину
			if (!accepted && reason) {
				resultEmbed.addFields({
					name: "📌 Причина",
					value: reason
				});
			}
		} else {
			// fallback на старый вариант, если interaction.message нет
			resultEmbed = new EmbedBuilder()
				.setTitle(`Заявка пользователя ${application.userId}`)
				.setColor(accepted ? "Green" : "Red")
				.addFields({ name: accepted ? "✅ Принял" : "❌ Отклонил", value: `<@${moderator.id}>`, inline: true })
				.setFooter({ text: "by Evri" })
				.setTimestamp();

			if (!accepted && reason) {
				resultEmbed.addFields({ name: "📌 Причина", value: reason });
			}
		}

		// --- Отправляем в лог-канал
		const logChannel = interaction.guild.channels.cache.get(RecruitLogID) as TextChannel;
		if (logChannel) {
			await logChannel.send({ embeds: [resultEmbed] }).catch(console.error);
		}

		// --- ЛС пользователю
		const authorUser = await interaction.client.users.fetch(application.userId).catch(() => null);
		if (authorUser) {
			await authorUser.send(
				accepted
					? `Поздравляем! Ваша заявка принята ✅`
					: `К сожалению, ваша заявка отклонена ❌${reason ? `\nПричина: ${reason}` : ""}`
			).catch(() => {});
		}

		// --- Выдаём роль на сервере если приняли
		if (accepted) {
			const member = await interaction.guild.members.fetch(application.userId).catch(() => null);
			if (member && FAMILY_USER_ROLE_IDS.length > 0) {
				// Добавляем все роли из массива
				await member.roles.add(FAMILY_USER_ROLE_IDS).catch(() => {});

				// Устанавливаем никнейм, если передан
				if (nicknameFromApplication) {
					await member.setNickname(nicknameFromApplication).catch(() => {});
				}
			}
		}

		// --- Ответ модератору
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: accepted ? "Заявка принята ✅" : "Заявка отклонена ❌",
				ephemeral: true
			});
		}

	} catch (err) {
		console.error("Ошибка processFamilyApplication:", err);
		if (!interaction.replied) {
			await interaction.reply({ content: "Произошла ошибка ❌", ephemeral: true });
		}
	}
}