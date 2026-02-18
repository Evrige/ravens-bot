import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GuildMember, Message, TextChannel } from "discord.js";
import { STAFF_ROLE_IDS } from "../../config/staff";
import { CUSTOM_IDS } from "../../constants/customIds";

export async function processApplication(
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
	const hasPermission = member.roles.cache.some(role => STAFF_ROLE_IDS.includes(role.id));
	if (!hasPermission) {
		return interaction.reply({ content: "❌ У вас нет прав", ephemeral: true });
	}

	const originalEmbed = appMessage.embeds[0];
	if (!originalEmbed) return;

	const authorUser = await interaction.client.users.fetch(userId).catch(() => null);
	const moderator = interaction.user;

	const resultEmbed = EmbedBuilder.from(originalEmbed)
		.setColor(accepted ? "Green" : "Red")
		.addFields(
			{ name: "👤 Автор заявки", value: authorUser ? `<@${authorUser.id}>` : "Не найден", inline: true },
			{ name: accepted ? "✅ Принял" : "❌ Отклонил", value: `<@${moderator.id}>`, inline: true }
		)
		.setFooter({ text: "by Evri" })
		.setTimestamp();

	if (!accepted && reason) {
		resultEmbed.addFields({ name: "📌 Причина", value: reason });
	}

	const logChannel = interaction.guild?.channels.cache.get(logChannelId);
	const logHighChannel = interaction.guild?.channels.cache.get(logHighChannelId);

	if (logChannel?.isTextBased()) {
		await logChannel.send({ embeds: [resultEmbed] });
	}

	if (accepted && logHighChannel?.isTextBased()) {
		const copyButton = new ButtonBuilder()
			.setCustomId(CUSTOM_IDS.COPY_TEXT)
			.setLabel("📋 Скопировать текст")
			.setStyle(ButtonStyle.Primary);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(copyButton);

		await (logHighChannel as TextChannel).send({ embeds: [resultEmbed], components: [row] });
	}

	if (!interaction.replied && !interaction.deferred) {
		await interaction.reply({ content: accepted ? "Заявка принята ✅" : "Заявка отклонена ❌", ephemeral: true });
	}

	await appMessage.delete().catch(() => {});

	const appChannel = appMessage.channel;
	if (appChannel?.isTextBased()) {
		const messages = await appChannel.messages.fetch({ limit: 50 }).catch(() => null);
		if (!messages) return;

		const remaining = messages.filter((msg: Message) =>
			msg.author.id === interaction.client.user!.id &&
			msg.embeds.length > 0 &&
			msg.embeds[0].title === "Улика"
		);

		if (remaining.size === 0) {
			await appChannel.delete().catch(() => {});
		}
	}
}
