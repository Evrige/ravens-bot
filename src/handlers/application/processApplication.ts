////////////////////////////////////////////////////////////
// 🔹 Принятие / отклонение
////////////////////////////////////////////////////////////

import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GuildMember, Message} from "discord.js";
import {STAFF_ROLE_IDS} from "../../config/staff";
import {CUSTOM_IDS} from "../../constants/customIds";

export async function processApplication(
	interaction: any,
	userId: string,
	accepted: boolean,
	reason?: string
) {
	const logChannelId = process.env.DB_LOG_CHANNEL_ID!;
	const logHighChannelId = process.env.DB_LOG_HIGH_CHANNEL_ID!;
	const appMessage = interaction.message;
	if (!appMessage) return;
	const member = interaction.member as GuildMember;

	const hasPermission = member.roles.cache.some(role =>
		STAFF_ROLE_IDS.includes(role.id)
	);

	if (!hasPermission) {
		return interaction.reply({
			content: "❌ У вас нет прав для этого действия.",
			ephemeral: true
		});
	}
	const appChannel = appMessage.channel;

	// Получаем оригинальный embed
	const originalEmbed = appMessage.embeds[0];
	if (!originalEmbed) return;

	const authorUser = await interaction.client.users.fetch(userId).catch(() => null);
	const moderator = interaction.user;

	// Создаём новый embed на основе старого
	const resultEmbed = EmbedBuilder.from(originalEmbed)
		.setColor(accepted ? "Green" : "Red")
		.addFields(
			{ name: "👤 Автор заявки", value: authorUser ? `<@${authorUser.id}>` : "Не найден", inline: true },
			{ name: accepted ? "✅ Принял" : "❌ Отклонил", value: `<@${moderator.id}>`, inline: true }
		);

	// Если отклонено — добавляем причину отдельным полем
	if (!accepted && reason) {
		resultEmbed.addFields({
			name: "📌 Причина",
			value: reason
		});
	}

	resultEmbed
		.setFooter({ text: "by Evri" })
		.setTimestamp();

	// Отправляем в лог
	const logChannel = interaction.guild?.channels.cache.get(logChannelId);
	const logHighChannel = interaction.guild?.channels.cache.get(logHighChannelId);
	if (logChannel && logChannel.isTextBased()) {
		await logChannel.send({ embeds: [resultEmbed] });
	}
	if (accepted && logHighChannel && logHighChannel.isTextBased()) {
		// Отправляем embed с кнопкой
		const copyButton = new ButtonBuilder()
			.setCustomId(CUSTOM_IDS.COPY_TEXT)
			.setLabel("📋 Скопировать текст")
			.setStyle(ButtonStyle.Primary);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(copyButton);

		const highMsg = await logHighChannel.send({
			embeds: [resultEmbed],
			components: [row]
		});

		// Создаём collector
		const collector = highMsg.createMessageComponentCollector({ time: 60_000 });

		collector.on("collect", async (i: any) => {
			if (!i.isButton()) return;
			if (i.customId !== CUSTOM_IDS.COPY_TEXT) return;

			// Берём embed из сообщения
			const msgEmbed = highMsg.embeds[0];
			if (!msgEmbed) return;

			// Формируем текст для копирования
			const getField = (name: string) => msgEmbed.fields.find((f: any) => f.name === name)?.value ?? "";
			const textToCopy =
				`**Имя**\n${getField("Имя в игре")}\n\n` +
				`**Ссылка**\n${getField("Видео")}\n\n` +
				`**Подробный рассказ**\n${getField("Подробный рассказ")}\n\n`;

			// ✅ Отправляем пользователю в ЛС
			await i.user.send({ content: textToCopy });

			await i.reply({ content: "Текст отправлен тебе в ЛС 📬", ephemeral: true });
		});
	}

	// Ответ модератору
	if (!interaction.replied && !interaction.deferred) {
		await interaction.reply({
			content: accepted ? "Заявка принята ✅" : "Заявка отклонена ❌",
			ephemeral: true
		}).catch(() => {});
	}

	// Удаляем сообщение заявки
	await appMessage.delete().catch(() => {});

	// Проверяем остались ли заявки
	if (appChannel && appChannel.isTextBased()) {
		const messages = await appChannel.messages.fetch({ limit: 50 }).catch(() => null);
		if (!messages) return;

		const remainingApplications = messages.filter((msg: Message) =>
			msg.author.id === interaction.client.user!.id &&
			msg.embeds.length > 0 &&
			msg.embeds[0].title === "Улика"
		);

		if (remainingApplications.size === 0) {
			await appChannel.delete().catch(() => {});
		}
	}
}