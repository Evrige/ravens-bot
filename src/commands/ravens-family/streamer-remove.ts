// commands/streamer/streamer-remove.ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {checkRolesOrReply} from "../../utils/checkRoles";
import {CUSTOM_COMMAND} from "../../constants/customIds";

export const streamerRemoveCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.STREAMER_REMOVE)
		.setDescription("Удалить стримера из уведомлений")
		.addUserOption(option =>
			option.setName("user")
				.setDescription("Пользователь Discord")
				.setRequired(true)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		// Проверка ролей
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const user = interaction.options.getUser("user", true);

		// Проверяем, есть ли стример в базе
		const exists = await prisma.streamer.findFirst({
			where: { discordUserId: user.id, guildId: interaction.guildId! }
		});

		if (!exists) {
			return interaction.reply({
				content: `⚠️ Стример <@${user.id}> не найден`,
				ephemeral: true
			});
		}

		// Удаляем стримера
		await prisma.streamer.delete({ where: { id: exists.id } });

		return interaction.reply({
			content: `✅ Стример <@${user.id}> удалён из уведомлений`,
			ephemeral: true
		});
	}
};