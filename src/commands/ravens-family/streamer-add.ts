import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	MessageFlags,
} from "discord.js";
import {prisma} from "../../utils/prisma";
import {CUSTOM_COMMAND} from "../../constants/customIds";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import {checkRolesOrReply} from "../../utils/checkRoles";
import { extractTwitchLogin, normalizeTwitchUrl } from "../../utils/streamers";
import { upsertStreamerPanel } from "../../services/upsertStreamerPanel";

export const streamerAddCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.STREAMER_ADD)
		.setDescription("Добавить стримера для уведомлений")
		.addUserOption(option =>
			option
				.setName("user")
				.setDescription("Пользователь Discord")
				.setRequired(true)
		)
		.addStringOption(option =>
			option
				.setName("twitch_url")
				.setDescription("Ссылка на Twitch канал")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			return interaction.reply({
				content: "Команда доступна только на сервере.",
				flags: MessageFlags.Ephemeral,
			});
		}
		// Проверка ролей
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const discordUser = interaction.options.getUser("user", true);
		const twitchUrl = interaction.options.getString("twitch_url", true);

		const twitchLogin = extractTwitchLogin(twitchUrl);

		if (!twitchLogin) {
			return interaction.reply({
				content: "❌ Неверная ссылка на Twitch.",
				flags: MessageFlags.Ephemeral,
			});
		}

		try {
			await prisma.streamer.create({
				data: {
					guildId: interaction.guild.id,
					discordUserId: discordUser.id,
					twitchLogin,
					twitchUrl: normalizeTwitchUrl(twitchLogin),
				}
			});
			await upsertStreamerPanel(interaction.client);

			return interaction.reply({
				content: `✅ Стример **${twitchLogin}** добавлен для <@${discordUser.id}>`
			});
		} catch (error: any) {
			if (error.code === "P2002") {
				return interaction.reply({
					content: "⚠️ Этот стример уже добавлен.",
					flags: MessageFlags.Ephemeral,
				});
			}

			console.error(error);
			return interaction.reply({
				content: "❌ Ошибка при сохранении в БД.",
				flags: MessageFlags.Ephemeral,
			});
		}
	}
};
