import { EmbedBuilder, Guild, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { FAMILY_USER_ROLE_IDS } from "../../../config/staff";
import { config } from "../../../config/env";
import { deleteFamilyTicketChannels } from "./familyTicketChannels";
import {
	consumeFamilyInterviewVoiceMs,
	formatFamilyInterviewVoiceDuration,
} from "../../../services/familyInterviewVoiceTracker";

async function safeInteractionResponse(interaction: any, content: string) {
	try {
		if (interaction.deferred) {
			return await interaction.editReply({ content });
		}

		if (interaction.replied) {
			return await interaction.followUp({
				content,
				flags: MessageFlags.Ephemeral,
			});
		}

		return await interaction.reply({
			content,
			flags: MessageFlags.Ephemeral,
		});
	} catch (error) {
		console.error("safeInteractionResponse error:", error);
	}
}

export async function processFamilyApplication(
	interaction: any,
	applicationId: bigint,
	accepted: boolean,
	reason?: string,
	nicknameFromApplication?: string
) {
	try {
		const recruitLogId = config.FAMILY_RECRUIT_LOG_ID;
		const moderator = interaction.user;

		const application = await prisma.application.findUnique({
			where: { id: applicationId },
		});

		if (!application) {
			await safeInteractionResponse(interaction, "Заявка не найдена ❌");
			return;
		}

		if (application.isAccepted !== null) {
			await safeInteractionResponse(interaction, "Заявка уже обработана ❌");
			return;
		}

		const updateResult = await prisma.application.updateMany({
			where: {
				id: applicationId,
				isAccepted: null,
			},
			data: {
				isAccepted: accepted,
				recruitId: moderator.id,
				reason: accepted ? null : reason,
			},
		});

		if (updateResult.count === 0) {
			await safeInteractionResponse(interaction, "Заявка уже обработана ❌");
			return;
		}

		const updatedApplication = await prisma.application.findUnique({
			where: { id: applicationId },
		});

		if (!updatedApplication) {
			await safeInteractionResponse(interaction, "Заявка не найдена ❌");
			return;
		}

		const interviewVoiceMs = consumeFamilyInterviewVoiceMs(applicationId, updatedApplication.userId);
		const interviewVoiceText =
			updatedApplication.callTakenById || interviewVoiceMs > 0
				? formatFamilyInterviewVoiceDuration(interviewVoiceMs)
				: null;

		let resultEmbed: EmbedBuilder;

		if (interaction.message?.embeds?.[0]) {
			const originalEmbed = interaction.message.embeds[0].toJSON();

			resultEmbed = EmbedBuilder.from(originalEmbed)
				.setColor(accepted ? "Green" : "Red")
				.addFields({
					name: accepted ? "✅ Принял" : "❌ Отклонил",
					value: `<@${moderator.id}>`,
					inline: false,
				});

			if (!accepted && reason) {
				resultEmbed.addFields({
					name: "📌 Причина",
					value: reason,
					inline: false,
				});
			}

			if (interviewVoiceText) {
				resultEmbed.addFields({
					name: "⏱️ Время в персональном войсе",
					value: interviewVoiceText,
					inline: false,
				});
			}
		} else {
			resultEmbed = new EmbedBuilder()
				.setTitle("Решение по заявке")
				.setColor(accepted ? "Green" : "Red")
				.addFields(
					{ name: "👤 Пользователь", value: `<@${updatedApplication.userId}>`, inline: false },
					{ name: "🧑 Имя", value: updatedApplication.name, inline: true },
					{ name: "🎂 Возраст", value: String(updatedApplication.age), inline: true },
					{ name: "🎯 Цель", value: updatedApplication.target, inline: false },
					{ name: "🔗 Ссылка", value: updatedApplication.link, inline: false },
					{ name: "ℹ️ Узнал о нас", value: updatedApplication.howToKnow, inline: false },
					{
						name: accepted ? "✅ Принял" : "❌ Отклонил",
						value: `<@${moderator.id}>`,
						inline: false,
					}
				)
				.setTimestamp();

			if (!accepted && reason) {
				resultEmbed.addFields({
					name: "📌 Причина",
					value: reason,
					inline: false,
				});
			}

			if (updatedApplication.callTakenById) {
				resultEmbed.addFields({
					name: "📞 Кто взял на обзвон",
					value: `<@${updatedApplication.callTakenById}>`,
					inline: false,
				});
			}

			if (interviewVoiceText) {
				resultEmbed.addFields({
					name: "⏱️ Время в персональном войсе",
					value: interviewVoiceText,
					inline: false,
				});
			}
		}

		const logChannel = interaction.guild.channels.cache.get(recruitLogId) as TextChannel;
		if (logChannel) {
			await logChannel.send({ embeds: [resultEmbed] }).catch(console.error);
		}

		const authorUser = await interaction.client.users.fetch(updatedApplication.userId).catch(() => null);
		if (authorUser) {
			await authorUser.send(
				accepted
					? `Поздравляем! Ваша заявка принята ✅`
					: `К сожалению, ваша заявка отклонена ❌${reason ? `\nПричина: ${reason}` : ""}`
			).catch(() => {});
		}

		if (accepted) {
			const member = await interaction.guild.members.fetch(updatedApplication.userId).catch(() => null);
			if (member && FAMILY_USER_ROLE_IDS.length > 0) {
				await member.roles.add(FAMILY_USER_ROLE_IDS).catch(() => {});

				if (nicknameFromApplication) {
					await member.setNickname(nicknameFromApplication).catch(() => {});
				}
			}
		}
		await safeInteractionResponse(
			interaction,
			accepted ? "Заявка принята ✅" : "Заявка отклонена ❌"
		);

		await deleteSourceMessageByUrl(interaction.guild, updatedApplication.sourceMessageUrl);

		if (
			interaction.message?.id &&
			interaction.message.url !== updatedApplication.sourceMessageUrl
		) {
			await interaction.message.delete().catch(() => {});
		}

		await deleteFamilyTicketChannels(interaction.guild, updatedApplication.userId);
	} catch (err) {
		console.error("Ошибка processFamilyApplication:", err);
		await safeInteractionResponse(interaction, "Произошла ошибка ❌");
	}
}

async function fetchSourceMessageByUrl(guild: Guild, messageUrl?: string | null) {
	try {
		if (!messageUrl) return null;

		const match = messageUrl.match(/\/channels\/(\d+)\/(\d+)\/(\d+)$/);
		if (!match) return null;

		const [, guildId, channelId, messageId] = match;

		if (guild.id !== guildId) return null;

		const channel = await guild.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) return null;

		const message = await channel.messages.fetch(messageId).catch(() => null);
		return message ?? null;
	} catch (error) {
		console.error("fetchSourceMessageByUrl error:", error);
		return null;
	}
}

async function deleteSourceMessageByUrl(guild: Guild, messageUrl?: string | null) {
	try {
		const message = await fetchSourceMessageByUrl(guild, messageUrl);
		if (!message) return;
		await message.delete().catch(() => {});
	} catch (error) {
		console.error("deleteSourceMessageByUrl error:", error);
	}
}

export async function autoDeclineFamilyApplicationsForUserLeave(guild: Guild, userId: string) {
	try {
		const activeApplications = await prisma.application.findMany({
			where: {
				userId,
				isAccepted: null,
			},
			orderBy: { createdAt: "desc" },
		});

		if (!activeApplications.length) return;

		const logChannel = guild.channels.cache.get(config.FAMILY_RECRUIT_LOG_ID) as TextChannel | undefined;

		for (const application of activeApplications) {
			await prisma.application.update({
				where: { id: application.id },
				data: {
					isAccepted: false,
					reason: "Покинул дс",
				},
			});

			const sourceMessage = await fetchSourceMessageByUrl(guild, application.sourceMessageUrl);
			const originalEmbed = sourceMessage?.embeds?.[0]?.toJSON();

			const resultEmbed = originalEmbed
				? EmbedBuilder.from(originalEmbed)
					.setColor("Red")
					.addFields(
						{
							name: "❌ Отклонено автоматически",
							value: "Пользователь покинул Discord-сервер",
							inline: false,
						},
						{
							name: "📌 Причина",
							value: "Покинул дс",
							inline: false,
						}
					)
				: new EmbedBuilder()
					.setTitle("Заявка отклонена автоматически")
					.setColor("Red")
					.addFields(
						{ name: "👤 Пользователь", value: `<@${application.userId}>`, inline: false },
						{ name: "🧑 Имя", value: application.name, inline: true },
						{ name: "🎂 Возраст", value: String(application.age), inline: true },
						{ name: "📌 Причина", value: "Покинул дс", inline: false },
					)
					.setTimestamp();

			if (logChannel) {
				await logChannel.send({ embeds: [resultEmbed] }).catch(() => {});
			}

			await deleteSourceMessageByUrl(guild, application.sourceMessageUrl);
		}

		await deleteFamilyTicketChannels(guild, userId);
	} catch (error) {
		console.error("autoDeclineFamilyApplicationsForUserLeave error:", error);
	}
}
