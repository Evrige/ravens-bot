import {CUSTOM_IDS} from "../../../constants/customIds";
import {buildDbEmbedFromModal} from "../../../utils/buildDbEmbedFromModal";
import {ChannelType, PermissionFlagsBits} from "discord.js";
import {DB_STAFF_ROLE_IDS, FAMILY_RECRUIT_ROLE_IDS} from "../../../config/staff";
import {processFamilyApplication} from "./processFamilyApplication";
import {buildFamilyButtons} from "./handleFamilyButtons";
import {buildFamilyEmbedFromModal} from "../../../utils/buildFamilyEmbedFromModal";
import {config} from "../../../config/env";

export async function handleFamilySubmit(interaction: any){
		if (interaction.customId === CUSTOM_IDS.FAMILY_MODAL_NEW) {

			const categoryId = config.FAMILY_RECRUIT_CATEGORY_ID!;
			const channelId = config.FAMILY_RECRUIT_CHANNEL_ID!;
			const forumId = config.FAMILY_RECRUIT_FORUM_ID!;

			let appChannel = interaction.guild?.channels.cache.find(
				(ch: any) => ch.id === channelId);

			const embed = buildFamilyEmbedFromModal(interaction);
			const buttons = buildFamilyButtons(interaction.user.id);

			if (appChannel?.isTextBased()) {

				const mentionText = FAMILY_RECRUIT_ROLE_IDS
					.map((id: any) => `<@&${id}>`)
					.join(" ");
				await appChannel.send({
					content: mentionText || undefined,
					embeds: [embed],
					components: [buttons]
				});
			}

			return interaction.reply({
				content: `✅ Ваша заявка принята, ожидайте.`,
				ephemeral: true
			});
		}

			// if (!appChannel) {
			// 	appChannel = await interaction.guild?.channels.create({
			// 		name: channelName,
			// 		type: ChannelType.GuildText,
			// 		parent: categoryId,
			// 		permissionOverwrites: [
			// 			{
			// 				id: interaction.guild!.id,
			// 				deny: [PermissionFlagsBits.ViewChannel]
			// 			},
			// 			{
			// 				id: interaction.user.id,
			// 				allow: [
			// 					PermissionFlagsBits.ViewChannel,
			// 					PermissionFlagsBits.SendMessages,
			// 					PermissionFlagsBits.ReadMessageHistory
			// 				]
			// 			},
			// 			...DB_STAFF_ROLE_IDS.map(roleId => ({
			// 				id: roleId,
			// 				allow: [
			// 					PermissionFlagsBits.ViewChannel,
			// 					PermissionFlagsBits.SendMessages,
			// 					PermissionFlagsBits.ReadMessageHistory
			// 				]
			// 			}))
			// 		]
			// 	});
			// }



		// ----------- ПРИЧИНА ОТКЛОНЕНИЯ ----------- //
		if (interaction.customId.startsWith("decline_reason_")) {
			const reason = interaction.fields.getTextInputValue("reason");
			const userId = interaction.customId.replace("decline_reason_", "");

			return processFamilyApplication(interaction, userId, false, reason);
		}
}