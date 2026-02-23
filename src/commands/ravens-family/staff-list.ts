import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_RECRUIT_ROLE_IDS, FAMILY_USER_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";

export const staffListCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.STAFF_LIST)
		.setDescription("Статистика участников STAFF по ролям"),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			if (!interaction.guild) {
				return interaction.reply({ content: "Гильдия не найдена ❌", ephemeral: true });
			}

			await interaction.deferReply(); // 🔥 ВАЖНО

			const guild = interaction.guild;

			// Загружаем участников (может занимать время)
			await guild.members.fetch();

			const allRoles = [
				...FAMILY_HIGH_ROLE_IDS,
				...FAMILY_RECRUIT_ROLE_IDS,
				...FAMILY_USER_ROLE_IDS
			];

			const generateDescription = async () => {
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

				return description || "Нет участников с STAFF ролями";
			};

			const embed = new EmbedBuilder()
				.setTitle("Семья")
				.setColor("Purple")
				.setDescription(await generateDescription())
				.setFooter({ text: "Обновляется каждые 30 секунд • by Evri" })
				.setTimestamp();

			const msg = await interaction.editReply({ embeds: [embed] });

			// Автообновление
			setInterval(async () => {
				const updatedEmbed = new EmbedBuilder()
					.setTitle("Семья")
					.setColor("Purple")
					.setDescription(await generateDescription())
					.setFooter({ text: "Обновляется каждые 30 секунд • by Evri" })
					.setTimestamp();

				await msg.edit({ embeds: [updatedEmbed] }).catch(() => {});
			}, 30 * 1000);

		} catch (err) {
			console.error("Ошибка staff-stats:", err);

			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "Ошибка при получении статистики ❌", ephemeral: true });
			}
		}
	},
};