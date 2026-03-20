import { ModalSubmitInteraction, EmbedBuilder, Message, MessageFlags, ChannelType } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { DB_STAFF_ROLE_IDS } from "../../../config/staff";
import { config } from "../../../config/env";

function hasStaffPerm(interaction: ModalSubmitInteraction) {
	const member: any = interaction.member;
	return member?.roles?.cache?.some((r: any) => DB_STAFF_ROLE_IDS.includes(r.id));
}

function isHiveApplicationMessage(message: Message, hiveIdStr?: string) {
	return message.author.id &&
		message.embeds.length > 0 &&
		message.components.some((row: any) =>
			row.components.some((btn: any) => {
				const id = btn.customId || "";

				if (hiveIdStr) {
					return (
						id === `${CUSTOM_IDS.ACCEPT}${hiveIdStr}` ||
						id === `${CUSTOM_IDS.DECLINE}${hiveIdStr}` ||
						id.startsWith(`${CUSTOM_IDS.CHANGE}${hiveIdStr}:`)
					);
				}

				return (
					id.startsWith(CUSTOM_IDS.ACCEPT) ||
					id.startsWith(CUSTOM_IDS.DECLINE) ||
					id.startsWith(CUSTOM_IDS.CHANGE)
				);
			})
		);
}

export async function handleHiveDeclineReasonSubmit(interaction: ModalSubmitInteraction) {
	if (!interaction.customId.startsWith(`${CUSTOM_IDS.HIVE_DECLINE_REASON}:`)) return;

	if (!hasStaffPerm(interaction)) {
		return interaction.reply({
			content: "❌ У вас нет прав.",
			flags: MessageFlags.Ephemeral,
		});
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	const hiveIdStr = interaction.customId.split(":")[1];
	const hiveId = BigInt(hiveIdStr);

	const reasonRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.REASON);
	const reason = (reasonRaw || "").trim().slice(0, 1024);

	const hive = await prisma.hive.findUnique({
		where: { id: hiveId },
		include: { organisation: true },
	});

	if (!hive) {
		return interaction.editReply("❌ Улика не найдена.").catch(() => {});
	}

	await prisma.hive.update({
		where: { id: hiveId },
		data: { status: "REJECTED" },
	}).catch(() => {});

	let originalEmbed: any = null;
	let applicationMessage: Message | null = null;

	const ch = interaction.channel;
	if (ch?.isTextBased()) {
		const messages = await ch.messages.fetch({ limit: 50 }).catch(() => null);

		applicationMessage =
			messages?.find((m: Message) => isHiveApplicationMessage(m, hiveIdStr)) ?? null;

		originalEmbed = applicationMessage?.embeds?.[0] ?? null;
	}

	const moderator = interaction.user;

	const resultEmbed = originalEmbed
		? EmbedBuilder.from(originalEmbed)
			.setColor("Red")
			.addFields(
				{ name: "❌ Отклонил", value: `<@${moderator.id}>`, inline: true },
				{ name: "Причина", value: reason || "-", inline: false }
			)
			.setFooter({ text: "by Evri" })
			.setTimestamp()
		: new EmbedBuilder()
			.setTitle("Улика")
			.setColor("Red")
			.addFields(
				{ name: "Организация", value: hive.organisation?.name ?? "-", inline: true },
				{ name: "❌ Отклонил", value: `<@${moderator.id}>`, inline: true },
				{ name: "Причина", value: reason || "-", inline: false }
			)
			.setFooter({ text: "by Evri" })
			.setTimestamp();

	const logChannel = interaction.guild?.channels.cache.get(config.DB_LOG_CHANNEL_ID);
	if (logChannel?.isTextBased()) {
		await logChannel.send({ embeds: [resultEmbed] }).catch(() => {});
	}

	// удаляем только сообщение этой улики
	if (applicationMessage) {
		await applicationMessage.delete().catch(() => {});
	}

	// если других заявок в канале не осталось — удаляем канал
	if (ch?.isTextBased() && ch.type === ChannelType.GuildText) {
		const leftMessages = await ch.messages.fetch({ limit: 50 }).catch(() => null);

		const hasOtherHiveMessages = leftMessages?.some((m: Message) => isHiveApplicationMessage(m)) ?? false;

		if (!hasOtherHiveMessages) {
			await (ch as any).delete().catch(() => {});
			return;
		}
	}

	await interaction.editReply("❌ Отклонено. Отправлено в лог и автору (если ЛС открыты).").catch(() => {});
}