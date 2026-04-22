import {
	ActionRowBuilder,
	Interaction,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	buildAfkListText,
	endAfk,
	expireAfk,
	getActiveAfkRecord,
	startAfk,
} from "../services/familyAfkService";
import { formatDateTime } from "../utils/formatters";

function buildAfkModal() {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_AFK_MODAL)
		.setTitle("Уйти в AFK");

	const hoursInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_AFK_HOURS_INPUT)
		.setLabel("На сколько часов? (1-24)")
		.setPlaceholder("Например: 3")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const reasonInput = new TextInputBuilder()
		.setCustomId(CUSTOM_IDS.FAMILY_AFK_REASON_INPUT)
		.setLabel("Причина AFK")
		.setPlaceholder("Например: отошёл по делам")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(hoursInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
	);

	return modal;
}

export async function handleFamilyAfkUI(interaction: Interaction) {
	await expireAfk(interaction.client).catch(() => {});

	if (interaction.isButton()) {
		if (interaction.customId === CUSTOM_IDS.FAMILY_AFK_ENTER) {
			await interaction.showModal(buildAfkModal());
			return true;
		}

		if (interaction.customId === CUSTOM_IDS.FAMILY_AFK_LIST) {
			await interaction.reply({
				content: await buildAfkListText(),
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		if (interaction.customId === CUSTOM_IDS.FAMILY_AFK_EXIT) {
			const existing = await getActiveAfkRecord(interaction.user.id);
			if (!existing) {
				await interaction.reply({
					content: "❌ У тебя сейчас нет активного AFK.",
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}

			await endAfk(interaction.client, interaction.user.id);
			await interaction.reply({
				content: "✅ Ты вышел из AFK.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}
	}

	if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.FAMILY_AFK_MODAL) {
		const hoursRaw = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_AFK_HOURS_INPUT).trim();
		const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.FAMILY_AFK_REASON_INPUT).trim();
		const hours = Number(hoursRaw);

		if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
			await interaction.reply({
				content: "❌ Укажи количество часов от 1 до 24.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		const result = await startAfk(interaction.client, {
			userId: interaction.user.id,
			username: interaction.user.username,
			reason,
			hours,
		});

		if (!result.ok) {
			await interaction.reply({
				content: result.reason === "already_active"
					? `❌ У тебя уже есть активный AFK до **${formatDateTime(result.record.endAt)}**.`
					: "⚠️ История AFK в БД пока недоступна. Примени миграцию Prisma и попробуй снова.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		await interaction.reply({
			content: `✅ Ты ушёл в AFK до **${formatDateTime(result.record.endAt)}**.\nПричина: ${reason}`,
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	return false;
}
