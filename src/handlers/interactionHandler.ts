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
import 'dotenv/config';
import {STAFF_ROLE_IDS} from "../config/staff";
import {CUSTOM_COMMAND, CUSTOM_IDS} from "../constants/customIds";
import {processApplication} from "./application/processApplication";
import {openApplicationModal} from "./application/openApplicationModal";
import {buildButtons} from "./application/handleButtons";
import {hiveCommand} from "../commands/detectives/application";
import {familyCommand} from "../commands/ravens-family/application";
import {createButton} from "../components/createButton";

export async function handleInteractions(interaction: Interaction) {

	// ================= SLASH =================
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.DB_APPLICATION) {
			return hiveCommand.execute(interaction);
		}
	}
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.FAMILY_APPLICATION) {
			return familyCommand.execute(interaction);
		}
	}
	// ================= BUTTONS =================
	if (interaction.isButton()) {

		// 🔹 КНОПКА COPY_TEXT
		if (interaction.customId.startsWith(CUSTOM_IDS.COPY_TEXT)) {

			const member = interaction.member as GuildMember;

			const hasPermission = member.roles.cache.some(role =>
				STAFF_ROLE_IDS.includes(role.id)
			);

			if (!hasPermission) {
				return interaction.reply({
					content: "❌ У вас нет прав.",
					ephemeral: true
				});
			}

			await interaction.deferReply({ ephemeral: true });

			const acceptButton = createButton({
				customId: `${CUSTOM_IDS.ACCEPT_HIVE}${interaction.user.id}`,
				label: "✅",
				style: ButtonStyle.Success
			})
			const declineButton = createButton({
				customId: `${CUSTOM_IDS.DECLINE_HIVE}${interaction.user.id}`,
				label: "❌",
				style: ButtonStyle.Danger
			})

			const message = interaction.message;

			// Проверяем есть ли уже 👀
			const existingReaction = message.reactions.cache.find(
				r => r.emoji.name === "👀"
			);

			if (!existingReaction) {
				// 👀 НЕТ — добавляем реакцию и кнопки

				await message.react("👀");

				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
					acceptButton,
					declineButton
				);

				await message.edit({
					components: [...message.components, row] // добавляем, не перезаписываем
				});

			}

			const msgEmbed = interaction.message.embeds[0];
			if (!msgEmbed) {
				return interaction.editReply("❌ Embed не найден.");
			}

			const getField = (name: string) =>
				msgEmbed.fields.find(f => f.name === name)?.value ?? "";

			const textToCopy =
				`**Имя**\n${getField("Имя в игре")}\n\n` +
				`**Ссылка**\n${getField("Видео")}\n\n` +
				`**Подробный рассказ**\n${getField("Подробный рассказ")}\n\n`;

			try {
				await interaction.user.send({ content: textToCopy });
				await interaction.editReply("✅ Текст отправлен в ЛС 📬");
			} catch {
				await interaction.editReply("❌ Не удалось отправить ЛС.");
			}

			return;
		}
		// Проверка улики администрацией
		if (
			interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
			interaction.customId.startsWith(CUSTOM_IDS.DECLINE_HIVE)
		) {
			const message = interaction.message;

			// Определяем какую кнопку нажали
			const isAccept = interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE);
			const reactionEmoji = isAccept ? "✅" : "❌";

			// Удаляем все реакции
			await message.reactions.removeAll();

			// Удаляем кнопки ACCEPT / DECLINE
			await message.edit({
				components: message.components.filter((row: any) =>
					!row.components.some((btn: any) =>
						btn.customId?.startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
						btn.customId?.startsWith(CUSTOM_IDS.DECLINE_HIVE)
					)
				)
			});

			// Добавляем финальную реакцию
			await message.react(reactionEmoji);
		}
		// Открыть форму
		if (interaction.customId === CUSTOM_IDS.OPEN_APPLICATION) {
			return openApplicationModal(interaction);
		}

		// Редактировать
		if (interaction.customId.startsWith(CUSTOM_IDS.CHANGE)) {
			const ownerId = interaction.customId.replace(CUSTOM_IDS.CHANGE, "");

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
		if (interaction.customId.startsWith(CUSTOM_IDS.ACCEPT)) {
			const userId = interaction.customId.replace(CUSTOM_IDS.ACCEPT, "");
			return processApplication(interaction, userId, true);
		}

		// Отклонить
		if (interaction.customId.startsWith(CUSTOM_IDS.DECLINE)) {
			const userId = interaction.customId.replace(CUSTOM_IDS.DECLINE, "");

			const modal = new ModalBuilder()
				.setCustomId(`${CUSTOM_IDS.DECLINE_REASON}${userId}`)
				.setTitle("Причина отклонения");

			const reasonInput = new TextInputBuilder()
				.setCustomId(CUSTOM_IDS.REASON)
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

		// ----------- РЕДАКТИРОВАНИЕ ----------- //
		if (interaction.customId.startsWith(CUSTOM_IDS.MODAL_EDIT)) {

			const messageId = interaction.customId.replace(CUSTOM_IDS.MODAL_EDIT, "");
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

		// ----------- НОВАЯ ЗАЯВКА ----------- //
		if (interaction.customId === CUSTOM_IDS.MODAL_NEW) {

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
						{
							id: interaction.guild!.id,
							deny: [PermissionFlagsBits.ViewChannel]
						},
						{
							id: interaction.user.id,
							allow: [
								PermissionFlagsBits.ViewChannel,
								PermissionFlagsBits.SendMessages,
								PermissionFlagsBits.ReadMessageHistory
							]
						},
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

		// ----------- ПРИЧИНА ОТКЛОНЕНИЯ ----------- //
		if (interaction.customId.startsWith("decline_reason_")) {
			const reason = interaction.fields.getTextInputValue("reason");
			const userId = interaction.customId.replace("decline_reason_", "");

			return processApplication(interaction, userId, false, reason);
		}
	}
}

// ============================================================
// 🔹 Создание embed из modal
// ============================================================
function buildEmbedFromModal(interaction: any) {

	const typeInput = interaction.fields.getTextInputValue("type").trim();
	const typeText = typeInput === "1" ? "Обязательная" : "Не обязательная";

	return new EmbedBuilder()
		.setTitle("Улика")
		.addFields(
			{ name: "Имя в игре", value: interaction.fields.getTextInputValue("game_name") },
			{ name: "Тип улики", value: typeText },
			{ name: "Подробный рассказ", value: interaction.fields.getTextInputValue("story") },
			{ name: "Видео", value: interaction.fields.getTextInputValue("video") },
			{ name: "На кого улика", value: interaction.fields.getTextInputValue("target") }
		)
		.setColor("Blue")
		.setTimestamp();
}
