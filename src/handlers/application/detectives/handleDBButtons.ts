import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	GuildMember,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from "discord.js";
import {createButton} from "../../../components/createButton";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {openDBApplicationModal} from "./openDBApplicationModal";
import {DB_STAFF_ROLE_IDS} from "../../../config/staff";
import {processDBApplication} from "./processDBApplication";

export function buildDBButtons(userId: string) {
	return new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			createButton({
				customId: `${CUSTOM_IDS.ACCEPT}${userId}`,
				label: "Принять",
				style: ButtonStyle.Success}),

			createButton({
				customId: `${CUSTOM_IDS.DECLINE}${userId}`,
				label: "Отклонить",
				style: ButtonStyle.Danger}),

			createButton({
				customId: `${CUSTOM_IDS.CHANGE}${userId}`,
				label: "✏️ Редактировать",
				style: ButtonStyle.Primary}),
		);
}

export async function handleDBButtons(interaction: any){

		// 🔹 КНОПКА COPY_TEXT
		if (interaction.customId.startsWith(CUSTOM_IDS.COPY_TEXT)) {

			const member = interaction.member as GuildMember;

			const hasPermission = member.roles.cache.some(role =>
				DB_STAFF_ROLE_IDS.includes(role.id)
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
				(r: any) => r.emoji.name === "👀"
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
				msgEmbed.fields.find((f: any) => f.name === name)?.value ?? "";

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
			const member = interaction.member as GuildMember;

			const hasPermission = member.roles.cache.some(role =>
				DB_STAFF_ROLE_IDS.includes(role.id)
			);

			if (!hasPermission) {
				return interaction.reply({
					content: "❌ У вас нет прав для подтверждения.",
					ephemeral: true
				});
			}

			const message = interaction.message;

			// Определяем какую кнопку нажали
			const isAccept = interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE);
			const reactionEmoji = isAccept ? "✅" : "❌";

			await interaction.deferUpdate(); // чтобы не было "interaction failed"

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

			return;
		}
		// Открыть форму
		if (interaction.customId === CUSTOM_IDS.OPEN_APPLICATION) {
			return openDBApplicationModal(interaction);
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

			return openDBApplicationModal(
				interaction,
				embed.fields,
				interaction.message.id
			);
		}

		// Принять
		if (interaction.customId.startsWith(CUSTOM_IDS.ACCEPT)) {
			const userId = interaction.customId.replace(CUSTOM_IDS.ACCEPT, "");
			return processDBApplication(interaction, userId, true);
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