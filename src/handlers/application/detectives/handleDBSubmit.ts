import {CUSTOM_IDS} from "../../../constants/customIds";
import {buildDbEmbedFromModal} from "../../../utils/buildDbEmbedFromModal";
import {ChannelType, PermissionFlagsBits} from "discord.js";
import {DB_STAFF_ROLE_IDS} from "../../../config/staff";
import {buildDBButtons} from "./handleDBButtons";
import {processDBApplication} from "./processDBApplication";

export async function handleDBSubmit(interaction: any){

		// ----------- РЕДАКТИРОВАНИЕ ----------- //
		if (interaction.customId.startsWith(CUSTOM_IDS.MODAL_EDIT)) {

			const messageId = interaction.customId.replace(CUSTOM_IDS.MODAL_EDIT, "");
			const channel = interaction.channel;

			if (!channel?.isTextBased()) return;

			const message = await channel.messages.fetch(messageId);

			const updatedEmbed = buildDbEmbedFromModal(interaction);

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
				(ch: any) => ch.name === channelName && ch.type === ChannelType.GuildText
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
						...DB_STAFF_ROLE_IDS.map(roleId => ({
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

			const embed = buildDbEmbedFromModal(interaction);
			const buttons = buildDBButtons(interaction.user.id);

			if (appChannel?.isTextBased()) {

				const mentionText = DB_STAFF_ROLE_IDS
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

			return processDBApplication(interaction, userId, false, reason);
		}
}