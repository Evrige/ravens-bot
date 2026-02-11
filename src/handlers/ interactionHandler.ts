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
	PermissionFlagsBits
} from "discord.js";

import { sendApplicationEmbed } from "../commands/application";

export async function handleInteractions(interaction: Interaction) {
	const member = interaction.member as GuildMember;
	const nickname = member?.nickname || interaction.user.username;

	// Slash command /заявка
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === "заявка") {
			await sendApplicationEmbed(interaction);
		}
	}

	// Нажатие кнопки "Подать заявку"
	if (interaction.isButton()) {
		if (interaction.customId === "open_application") {
			const modal = new ModalBuilder()
				.setCustomId("application_modal")
				.setTitle("Форма заявки");

			const nameInput = new TextInputBuilder()
				.setCustomId("game_name")
				.setLabel("Имя в игре")
				.setStyle(TextInputStyle.Short)
				.setValue(nickname);

			const typeInput = new TextInputBuilder()
				.setCustomId("type")
				.setLabel("Тип улики")
				.setStyle(TextInputStyle.Short)
				.setPlaceholder("Введите 1 (обязательная) или 0 (не обязательная)");

			const storyInput = new TextInputBuilder()
				.setCustomId("story")
				.setLabel("Подробный рассказ")
				.setStyle(TextInputStyle.Paragraph);

			const videoInput = new TextInputBuilder()
				.setCustomId("video")
				.setLabel("Ссылка на видео (YouTube/RuTube)")
				.setStyle(TextInputStyle.Short);

			const targetInput = new TextInputBuilder()
				.setCustomId("target")
				.setLabel("На кого улика")
				.setStyle(TextInputStyle.Short);

			modal.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
				new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
				new ActionRowBuilder<TextInputBuilder>().addComponents(storyInput),
				new ActionRowBuilder<TextInputBuilder>().addComponents(videoInput),
				new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput)
			);

			await interaction.showModal(modal);
		}

		// Обработка кнопок Принять/Отклонить
		if (interaction.customId.startsWith("accept_")) {
			const userId = interaction.customId.replace("accept_", "");
			await processApplication(interaction, userId, true); // ✅ принятa
		}

		if (interaction.customId.startsWith("decline_")) {
			const userId = interaction.customId.replace("decline_", "");
			const modal = new ModalBuilder()
				.setCustomId(`decline_reason_${userId}`)
				.setTitle("Причина отклонения");

			const reasonInput = new TextInputBuilder()
				.setCustomId("reason")
				.setLabel("Причина")
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

			await interaction.showModal(modal);
		}
	}

	// Отправка формы заявки
	if (interaction.isModalSubmit()) {
		// Основная форма заявки
		if (interaction.customId === "application_modal") {
			const gameName = interaction.fields.getTextInputValue("game_name");
			const typeInput = interaction.fields.getTextInputValue("type").trim();
			const story = interaction.fields.getTextInputValue("story");
			const video = interaction.fields.getTextInputValue("video");
			const target = interaction.fields.getTextInputValue("target");

			let typeText: string;
			if (typeInput === "1") typeText = "Тип улики: Обязательная";
			else if (typeInput === "0") typeText = "Тип улики: Не обязательная";
			else {
				return interaction.reply({
					content: "❌ Введите только `1` или `0` в поле Тип улики",
					ephemeral: true
				});
			}

			const channelName = `заявка-${interaction.user.username.toLowerCase()}`;
			const categoryId = process.env.DB_CATEGORY_ID; // <-- Вставь ID категории для заявок

			let appChannel = interaction.guild?.channels.cache.find(
				ch => ch.name === channelName && ch.type === ChannelType.GuildText
			);

			if (!appChannel) {
				appChannel = await interaction.guild?.channels.create({
					name: channelName,
					type: ChannelType.GuildText,
					parent: categoryId,
					permissionOverwrites: [
						{ id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
						{ id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel] }
					]
				});
			}

			const embed = new EmbedBuilder()
				.setTitle("📨 Новая заявка")
				.addFields(
					{ name: "Имя в игре", value: gameName },
					{ name: "Тип улики", value: typeText },
					{ name: "На кого улика", value: target },
					{ name: "Подробный рассказ", value: story },
					{ name: "Видео", value: video }
				)
				.setColor("Blue")
				.setTimestamp();

			const buttons = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setCustomId(`accept_${interaction.user.id}`)
						.setLabel("Принять")
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder()
						.setCustomId(`decline_${interaction.user.id}`)
						.setLabel("Отклонить")
						.setStyle(ButtonStyle.Danger)
				);

			if (appChannel && appChannel.isTextBased()) {
				await appChannel.send({ embeds: [embed], components: [buttons] });
			}

			await interaction.reply({
				content: `✅ Ваша заявка отправлена в канал #${appChannel?.name}`,
				ephemeral: true
			});
		}

		// Модалка отклонения с причиной
		if (interaction.customId.startsWith("decline_reason_")) {
			const reason = interaction.fields.getTextInputValue("reason");
			const userId = interaction.customId.replace("decline_reason_", "");
			await processApplication(interaction, userId, false, reason);
		}
	}
}

// ---- Функция обработки заявки ----
async function processApplication(
	interaction: any,
	userId: string,
	accepted: boolean,
	reason?: string
) {
	const logChannelId = process.env.DB_LOG_CHANNEL_ID; // <-- Вставь ID канала логов
	const appMessage = interaction.message;
	if (!appMessage) return;

	const appChannel = appMessage.channel; // сохраняем канал заранее

	const resultEmbed = EmbedBuilder.from(appMessage.embeds[0])
		.setColor(accepted ? "Green" : "Red")
		.setFooter({
			text: accepted
				? "Статус: Принята"
				: `Статус: Отклонена. Причина: ${reason}`
		})
		.setTimestamp();

	const logChannel = interaction.guild?.channels.cache.get(logChannelId);
	if (logChannel && logChannel.isTextBased()) {
		await logChannel.send({ embeds: [resultEmbed] });
	}

	// Сначала отвечаем пользователю, чтобы не было ошибки 10003
	if (interaction.replied === false && interaction.deferred === false) {
		await interaction.reply({
			content: accepted ? "Заявка принята ✅" : "Заявка отклонена ❌",
			ephemeral: true
		}).catch(() => {});
	}

	// Удаляем сообщение в персональном канале
	await appMessage.delete().catch(() => {});

	// Если канал пуст, удаляем его
	if (appChannel && appChannel.isTextBased()) {
		const messages = await appChannel.messages.fetch({ limit: 1 }).catch(() => null);
		if (!messages || messages.size === 0) {
			await appChannel.delete().catch(() => {});
		}
	}
}
