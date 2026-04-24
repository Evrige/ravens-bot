import {
	ActionRowBuilder,
	Interaction,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import { parseGiveawayEndTime } from "../services/giveawayService";
import {
	buildVacationListText,
	endVacation,
	expireVacations,
	getActiveVacationRecord,
	startVacation,
} from "../services/familyVacationService";
import { formatDateTime } from "../utils/formatters";

function buildVacationModal() {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_VACATION_MODAL)
		.setTitle("Уйти в отпуск");

	const untilInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_VACATION_UNTIL_INPUT)
		.setLabel("До какого времени отпуск?")
		.setPlaceholder("Например: 18:00 27.04 или 3d")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const reasonInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_VACATION_REASON_INPUT)
		.setLabel("Причина отпуска")
		.setPlaceholder("Например: занят в реале")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(untilInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
	);

	return modal;
}

export async function handleFamilyVacationUI(interaction: Interaction) {
	await expireVacations(interaction.client).catch(() => {});

	if (interaction.isButton()) {
		if (interaction.customId === CUSTOM_IDS.FAMILY_VACATION_ENTER) {
			await interaction.showModal(buildVacationModal());
			return true;
		}

		if (interaction.customId === CUSTOM_IDS.FAMILY_VACATION_LIST) {
			await interaction.reply({
				content: await buildVacationListText(),
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		if (interaction.customId === CUSTOM_IDS.FAMILY_VACATION_EXIT) {
			const existing = await getActiveVacationRecord(interaction.user.id);
			if (!existing) {
				await interaction.reply({
					content: "❌ У тебя сейчас нет активного отпуска.",
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}

			await endVacation(interaction.client, interaction.user.id);
			await interaction.reply({
				content: "✅ Ты вернулся из отпуска.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}
	}

	if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.FAMILY_VACATION_MODAL) {
		const untilRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_VACATION_UNTIL_INPUT).trim();
		const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_VACATION_REASON_INPUT).trim();
		const endAt = parseGiveawayEndTime(untilRaw);

		if (!reason) {
			await interaction.reply({
				content: "❌ Укажи причину отпуска.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		if (!endAt || endAt.getTime() <= Date.now()) {
			await interaction.reply({
				content: "❌ Не удалось распознать дату окончания отпуска. Используй один из поддерживаемых форматов.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		const result = await startVacation(interaction.client, {
			userId: interaction.user.id,
			username: interaction.user.username,
			reason,
			endAt,
		});

		if (!result.ok) {
			await interaction.reply({
				content: `❌ У тебя уже есть активный отпуск до **${formatDateTime(result.record.endAt)}**.`,
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		await interaction.reply({
			content: `✅ Ты ушёл в отпуск до **${formatDateTime(result.record.endAt)}**.\nПричина: ${reason}`,
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	return false;
}
