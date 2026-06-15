import { EmbedBuilder } from "discord.js";

type HiveResultEmbedOptions = {
	originalEmbed?: any;
	accepted: boolean;
	moderatorId: string;
	reason?: string;
	organisationName?: string;
};

export function buildHiveResultEmbed(options: HiveResultEmbedOptions) {
	const embed = options.originalEmbed
		? EmbedBuilder.from(options.originalEmbed)
		: new EmbedBuilder()
			.setTitle("Улика")
			.addFields({
				name: "Организация",
				value: options.organisationName || "-",
				inline: true,
			});

	embed
		.setColor(options.accepted ? "Green" : "Red")
		.addFields({
			name: options.accepted ? "✅ Принял" : "❌ Отклонил",
			value: `<@${options.moderatorId}>`,
			inline: true,
		})
		.setFooter({ text: "by Evri" })
		.setTimestamp();

	if (!options.accepted) {
		embed.addFields({
			name: "Причина отказа",
			value: options.reason || "-",
			inline: false,
		});
	}

	return embed;
}
