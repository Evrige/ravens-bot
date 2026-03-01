import { ModalSubmitInteraction, EmbedBuilder, Message } from "discord.js";
import { prisma } from "../../../utils/prisma";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { DB_STAFF_ROLE_IDS } from "../../../config/staff";
import { config } from "../../../config/env";

function hasStaffPerm(interaction: ModalSubmitInteraction) {
	const member: any = interaction.member;
	return member?.roles?.cache?.some((r: any) => DB_STAFF_ROLE_IDS.includes(r.id));
}

export async function handleHiveDeclineReasonSubmit(interaction: ModalSubmitInteraction) {
	// ловим только нашу модалку
	if (!interaction.customId.startsWith(`${CUSTOM_IDS.HIVE_DECLINE_REASON}:`)) return;

	if (!hasStaffPerm(interaction)) {
		return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
	}

	await interaction.deferReply({ ephemeral: true }).catch(() => {});

	const hiveIdStr = interaction.customId.split(":")[1];
	const hiveId = BigInt(hiveIdStr);

	const reasonRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.REASON);
	const reason = (reasonRaw || "").trim().slice(0, 1024); // на всякий

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
	});

	// 1) Уведомление автору в ЛС (как было)
	await interaction.client.users.fetch(hive.userId)
		.then(u =>
			u.send(
				`❌ Ваша улика отклонена.\n` +
				`**Организация:** ${hive.organisation?.name ?? "-"}\n` +
				`**Причина:** ${reason || "-"}`
			)
		)
		.catch(() => null);

	// 2) Берём исходный embed заявки (из канала заявки)
	// Модалка открывалась из сообщения в этом канале, но interaction.message у modal нет,
	// поэтому ищем последнее сообщение бота с embed'ом "Улика"
	let originalEmbed = null as any;

	const ch = interaction.channel;
	if (ch?.isTextBased()) {
		const messages = await ch.messages.fetch({ limit: 30 }).catch(() => null);
		const appMsg = messages?.find((m: Message) =>
			m.author.id === interaction.client.user?.id &&
			m.embeds.length > 0
		);
		originalEmbed = appMsg?.embeds?.[0] ?? null;
	}

	// 3) Готовим embed для лога
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
				{ name: "Причина", value: reason || "-", inline: false },
			)
			.setFooter({ text: "by Evri" })
			.setTimestamp();

	// 4) Отправляем в лог БЕЗ кнопок
	const logChannel = interaction.guild?.channels.cache.get(config.DB_LOG_CHANNEL_ID);
	if (logChannel?.isTextBased()) {
		await logChannel.send({ embeds: [resultEmbed] }).catch(() => {});
	}

	// 5) Ответ модеру
	await interaction.editReply("❌ Отклонено. Отправлено в лог и автору (если ЛС открыты).").catch(() => {});

	// 6) Удаление/чистка как в accept (опционально)
	if (ch?.isTextBased()) {
		// удалим сообщения бота с embed'ами в этом канале (чтобы канал остался пустым)
		const messages = await ch.messages.fetch({ limit: 50 }).catch(() => null);
		if (messages) {
			const botEmbeds = messages.filter((m: Message) =>
				m.author.id === interaction.client.user?.id && m.embeds.length > 0
			);
			for (const m of botEmbeds.values()) {
				await m.delete().catch(() => {});
			}
		}


		// если канал пустой — удалить
		const left = await ch.messages.fetch({ limit: 10 }).catch(() => null);
		if (left && left.size === 0) {
			await (ch as any).delete().catch(() => {});
		}
	}

	return;
}