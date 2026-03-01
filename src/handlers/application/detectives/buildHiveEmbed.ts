import { EmbedBuilder } from "discord.js";

export function buildHiveEmbed(params: {
	organisationName: string;
	gameName: string;
	hiveTypeLabel: string; // "Обязательная"/"Не обязательная"
	video: string;
	story: string;
	authorId: string;
}) {
	return new EmbedBuilder()
		.setTitle("Улика")
		.addFields(
			{ name: "Имя в игре", value: params.gameName || "-", inline: false },
			{ name: "Тип улики", value: params.hiveTypeLabel, inline: false },
			{ name: "Подробный рассказ", value: (params.story || "-").slice(0, 1024), inline: false },
			{ name: "Видео", value: params.video || "-", inline: false },

			// ✅ как ты просил: просто название организации
			{ name: "На кого улика", value: params.organisationName || "-", inline: false },

			// ✅ тег автора как на скрине
			{ name: "👤 Автор заявки", value: `<@${params.authorId}>`, inline: true },
		)
		.setFooter({ text: "by Evri" })
		.setTimestamp();
}