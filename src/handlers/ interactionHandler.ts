import {
	ActionRowBuilder,
	Interaction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	EmbedBuilder,
	ChannelType,
	GuildMember,
	ButtonBuilder,
	ButtonStyle,
	PermissionFlagsBits,
	Message
} from "discord.js";

import { sendApplicationEmbed } from "../commands/application";
const STAFF_ROLE_IDS = process.env.STAFF_ROLE_IDS
	? process.env.STAFF_ROLE_IDS.split(",").map(id => id.trim())
	: [];
export async function handleInteractions(interaction: Interaction) {

	// ================= SLASH =================
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === "заявка") {
			return sendApplicationEmbed(interaction);
		}
	}

	// ================= BUTTONS =================
	if (interaction.isButton()) {

		// Открыть форму
		if (interaction.customId === "open_application") {
			return openApplicationModal(interaction);
		}

		// Редактировать
		if (interaction.customId.startsWith("change_")) {
			const ownerId = interaction.customId.replace("change_", "");

			// ❌ Если нажал не создатель
			if (interaction.user.id !== ownerId) {
				return interaction.reply({
					content: "❌ Редактировать заявку может только её автор.",
					ephemeral: true
				});
			}

			const embed = interaction.message.embeds[0];
			if (!embed?.fields) return;

			return openApplicationModal(
				interaction,
				embed.fields,
				interaction.message.id
			);
		}

		// Принять
		if (interaction.customId.startsWith("accept_")) {
			const userId = interaction.customId.replace("accept_", "");
			return processApplication(interaction, userId, true);
		}

		// Отклонить
		if (interaction.customId.startsWith("decline_")) {
			const userId = interaction.customId.replace("decline_", "");

			const modal = new ModalBuilder()
				.setCustomId(`decline_reason_${userId}`)
				.setTitle("Причина отклонения");

			const reasonInput = new TextInputBuilder()
				.setCustomId("reason")
				.setLabel("Причина")
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
			);

			return interaction.showModal(modal);
		}
	}

	// ================= MODAL SUBMIT =================
	if (interaction.isModalSubmit()) {

		// ----------- РЕДАКТИРОВАНИЕ -----------
		if (interaction.customId.startsWith("application_modal_edit_")) {

			const messageId = interaction.customId.replace("application_modal_edit_", "");
			const channel = interaction.channel;

			if (!channel?.isTextBased()) return;

			const message = await channel.messages.fetch(messageId);

			const updatedEmbed = buildEmbedFromModal(interaction);

			await message.edit({ embeds: [updatedEmbed] });

			return interaction.reply({
				content: "✏️ Заявка обновлена",
				ephemeral: true
			});
		}

		// ----------- НОВАЯ ЗАЯВКА -----------
		if (interaction.customId === "application_modal") {

			const typeInput = interaction.fields.getTextInputValue("type").trim();

			if (typeInput !== "1" && typeInput !== "0") {
				return interaction.reply({
					content: "❌ Введите только `1` или `0`",
					ephemeral: true
				});
			}

			const channelName = `заявка-${interaction.user.username.toLowerCase()}`;
			const categoryId = process.env.DB_CATEGORY_ID!;

			let appChannel = interaction.guild?.channels.cache.find(
				ch => ch.name === channelName && ch.type === ChannelType.GuildText
			);

			if (!appChannel) {
				appChannel = await interaction.guild?.channels.create({
					name: channelName,
					type: ChannelType.GuildText,
					parent: categoryId,
					permissionOverwrites: [
						// ❌ Скрыть от всех
						{
							id: interaction.guild!.id,
							deny: [PermissionFlagsBits.ViewChannel]
						},

						// ✅ Автор заявки
						{
							id: interaction.user.id,
							allow: [
								PermissionFlagsBits.ViewChannel,
								PermissionFlagsBits.SendMessages,
								PermissionFlagsBits.ReadMessageHistory
							]
						},

						// ✅ Все роли из массива STAFF_ROLE_IDS
						...STAFF_ROLE_IDS.map(roleId => ({
							id: roleId,
							allow: [
								PermissionFlagsBits.ViewChannel,
								PermissionFlagsBits.SendMessages,
								PermissionFlagsBits.ReadMessageHistory
							]
						}))
					]
				});
			}

			const embed = buildEmbedFromModal(interaction);

			const buttons = buildButtons(interaction.user.id);

			if (appChannel?.isTextBased()) {

				const mentionText = STAFF_ROLE_IDS
					.map((id: any) => `<@&${id}>`)
					.join(" ");

				await appChannel.send({
					content: mentionText || undefined,
					embeds: [embed],
					components: [buttons]
				});
			}


			return interaction.reply({
				content: `✅ Ваша заявка отправлена в канал #${appChannel?.name}`,
				ephemeral: true
			});
		}

		// ----------- ПРИЧИНА ОТКЛОНЕНИЯ -----------
		if (interaction.customId.startsWith("decline_reason_")) {
			const reason = interaction.fields.getTextInputValue("reason");
			const userId = interaction.customId.replace("decline_reason_", "");

			return processApplication(interaction, userId, false, reason);
		}
	}
}

////////////////////////////////////////////////////////////
// 🔹 Открытие формы
////////////////////////////////////////////////////////////

async function openApplicationModal(
	interaction: any,
	data?: any,
	messageId?: string
) {

	const member = interaction.member as GuildMember;
	const nickname = member?.nickname || interaction.user.username;

	const modal = new ModalBuilder()
		.setCustomId(
			messageId
				? `application_modal_edit_${messageId}`
				: "application_modal"
		)
		.setTitle(data ? "Редактирование" : "Форма заявки");

	const nameInput = new TextInputBuilder()
		.setCustomId("game_name")
		.setLabel("Имя в игре")
		.setStyle(TextInputStyle.Short)
		.setValue(data ? data[0].value : nickname);

	const typeInput = new TextInputBuilder()
		.setCustomId("type")
		.setLabel("Тип улики (1 или 0)")
		.setStyle(TextInputStyle.Short)
	if(data) {
		typeInput.setValue(
			data
				? (data[1].value === "Обязательная" ? "1" : "0")
				: ""
		);
	}

	const storyInput = new TextInputBuilder()
		.setCustomId("story")
		.setLabel("Подробный рассказ")
		.setStyle(TextInputStyle.Paragraph)
	if (data) {
		storyInput.setValue(data[3].value);
	}

	const videoInput = new TextInputBuilder()
		.setCustomId("video")
		.setLabel("Ссылка на видео")
		.setStyle(TextInputStyle.Short)
	if (data) {
		videoInput.setValue(data[4].value);
	}

	const targetInput = new TextInputBuilder()
		.setCustomId("target")
		.setLabel("На кого улика")
		.setStyle(TextInputStyle.Short)
	if (data) {
		targetInput.setValue(data[2].value);
	}

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(storyInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(videoInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput)
	);

	return interaction.showModal(modal);
}

////////////////////////////////////////////////////////////
// 🔹 Создание embed
////////////////////////////////////////////////////////////

function buildEmbedFromModal(interaction: any) {

	const typeInput = interaction.fields.getTextInputValue("type").trim();
	const typeText = typeInput === "1"
		? "Обязательная"
		: "Не обязательная";

	return new EmbedBuilder()
		.setTitle("Улика")
		.addFields(
			{ name: "Имя в игре", value: interaction.fields.getTextInputValue("game_name") },
			{ name: "Тип улики", value: typeText },
			{ name: "На кого улика", value: interaction.fields.getTextInputValue("target") },
			{ name: "Подробный рассказ", value: interaction.fields.getTextInputValue("story") },
			{ name: "Видео", value: interaction.fields.getTextInputValue("video") }
		)
		.setColor("Blue")
		.setTimestamp();
}

////////////////////////////////////////////////////////////
// 🔹 Кнопки
////////////////////////////////////////////////////////////

function buildButtons(userId: string) {
	return new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`accept_${userId}`)
				.setLabel("Принять")
				.setStyle(ButtonStyle.Success),

			new ButtonBuilder()
				.setCustomId(`decline_${userId}`)
				.setLabel("Отклонить")
				.setStyle(ButtonStyle.Danger),

			new ButtonBuilder()
				.setCustomId(`change_${userId}`)
				.setLabel("✏️ Редактировать")
				.setStyle(ButtonStyle.Primary)
		);
}

////////////////////////////////////////////////////////////
// 🔹 Принятие / отклонение
////////////////////////////////////////////////////////////

async function processApplication(
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
	const STAFF_ROLE_IDS = process.env.STAFF_ROLE_IDS
		? process.env.STAFF_ROLE_IDS.split(",").map(id => id.trim())
		: [];
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
			.setCustomId("copy_text")
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
			if (i.customId !== "copy_text") return;

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

			// Можно ещё уведомить о том, что сообщение отправлено в DM
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