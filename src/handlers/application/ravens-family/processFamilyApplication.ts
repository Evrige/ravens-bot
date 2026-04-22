import { EmbedBuilder, Guild, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { FAMILY_USER_ROLE_IDS } from "../../../config/staff";
import { config } from "../../../config/env";
import { deleteFamilyTicketChannels } from "./familyTicketChannels";

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

		const updatedApplication = await prisma.application.update({
			where: { id: applicationId },
			data: {
				isAccepted: accepted,
				recruitId: moderator.id,
				reason: accepted ? null : reason,
			},
		});

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

		await deleteSourceMessageByUrl(interaction, updatedApplication.sourceMessageUrl);

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

async function deleteSourceMessageByUrl(interaction: any, messageUrl?: string | null) {
	try {
		if (!messageUrl) return;

		const match = messageUrl.match(/\/channels\/(\d+)\/(\d+)\/(\d+)$/);
		if (!match) return;

		const [, guildId, channelId, messageId] = match;

		if (interaction.guild?.id !== guildId) return;

		const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) return;

		const message = await channel.messages.fetch(messageId).catch(() => null);
		if (!message) return;

		await message.delete().catch(() => {});
	} catch (error) {
		console.error("deleteSourceMessageByUrl error:", error);
	}
}
