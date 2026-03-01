import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {upsertHivePanelInChannel} from "../../services/upsertHivePanel";

export const hiveCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DB_APPLICATION)
		.setDescription("Создать/обновить панель подачи улики (2 селекта)"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const ch = interaction.channel;
		if (!ch || !ch.isTextBased()) return interaction.editReply("❌ Канал не поддерживается.");

		// важно: нужен именно TextChannel (не thread)
		const channel = ch as TextChannel;

		const res = await upsertHivePanelInChannel(channel);
		return interaction.editReply(res.mode === "created" ? "✅ Панель создана." : "✅ Панель обновлена.");
	},
};