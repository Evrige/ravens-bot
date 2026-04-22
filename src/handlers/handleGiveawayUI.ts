import { ButtonInteraction, MessageFlags } from "discord.js";
import { CUSTOM_IDS } from "../constants/customIds";
import { finalizeGiveaway, refreshGiveawayState, syncGiveawayMessage } from "../services/giveawayService";
import { getGiveawayById, mutateGiveaways } from "../utils/giveawayStore";

export async function handleGiveawayUI(interaction: ButtonInteraction) {
	if (!interaction.customId.startsWith(CUSTOM_IDS.GIVEAWAY_JOIN)) {
		return false;
	}

	const giveawayId = interaction.customId.slice(CUSTOM_IDS.GIVEAWAY_JOIN.length);
	const giveaway = await getGiveawayById(giveawayId);

	if (!giveaway) {
		await interaction.reply({
			content: "❌ Этот giveaway уже не найден.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (giveaway.ended || new Date(giveaway.endAt).getTime() <= Date.now()) {
		await finalizeGiveaway(interaction.client, giveaway.id);
		await interaction.reply({
			content: "⏰ Время розыгрыша уже истекло, участие закрыто.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (giveaway.participants.includes(interaction.user.id)) {
		await interaction.reply({
			content: "ℹ️ Ты уже участвуешь в этом giveaway.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	let updated = giveaway;
	await mutateGiveaways((records) => {
		const existing = records.find((record) => record.id === giveaway.id);
		if (!existing) return;
		existing.participants.push(interaction.user.id);
		updated = { ...existing };
	});

	await syncGiveawayMessage(interaction.client, updated);
	await refreshGiveawayState(interaction.client, giveaway.id);

	await interaction.reply({
		content: `✅ Ты участвуешь в giveaway **${updated.prize}**.`,
		flags: MessageFlags.Ephemeral,
	}).catch(() => {});

	return true;
}
