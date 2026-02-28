import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../utils/prisma";
import {
	FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS,
	FAMILY_RECRUIT_ROLE_IDS,
	FAMILY_USER_ROLE_IDS
} from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {checkRolesOrReply} from "../../utils/checkRoles";

export const staffListCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.STAFF_LIST)
		.setDescription("Статистика участников STAFF по ролям"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			if (!interaction.guild) {
				return interaction.reply({ content: "Гильдия не найдена ❌", ephemeral: true });
			}

			await interaction.deferReply();

			const guild = interaction.guild;

			// Проверка ролей
			if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

			const allRoles = [
				...FAMILY_HIGH_ROLE_IDS,
				...FAMILY_RECRUIT_ROLE_IDS,
				...FAMILY_USER_ROLE_IDS
			];

			const mentionedUsers = new Set<string>();
			let description = "";

			for (const roleId of allRoles) {
				const role = await guild.roles.fetch(roleId).catch(() => null);
				if (!role) continue;

				const members = role.members.filter(m => !mentionedUsers.has(m.id));

				if (members.size > 0) {
					description += `**${role}**\n`;

					members.forEach(m => {
						description += `<@${m.id}>\n`;
						mentionedUsers.add(m.id);
					});

					description += "\n";
				}
			}

			const embed = new EmbedBuilder()
				.setTitle("Семья")
				.setColor("Purple")
				.setDescription(description || "Нет участников с STAFF ролями")
				.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
				.setTimestamp();

			const msg = await interaction.editReply({ embeds: [embed] });

			// ✅ Сохраняем messageId в БД
			await prisma.botMessage.upsert({
				where: { type: "staff_list" },
				update: { messageId: msg.id, channelId: msg.channelId },
				create: { type: "staff_list", messageId: msg.id, channelId: msg.channelId }
			});

		} catch (err) {
			console.error("Ошибка staff-list:", err);

			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "Ошибка при получении статистики ❌",
					ephemeral: true
				});
			}
		}
	},
};