import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";

export const recruitCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.RECRUIT)
		.setDescription("Показать заявки, которые рассмотрел рекрут")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("Выберите рекрута")
				.setRequired(true)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// Проверка ролей обязательно ДО deferReply
			if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const recruitUser = interaction.options.getUser("user", true);

			const applications = await prisma.application.findMany({
				where: {
					recruitId: recruitUser.id,
				},
				orderBy: { createdAt: "desc" },
				take: 20,
				select: {
					createdAt: true,
					isAccepted: true,
					reason: true,
					name: true,
					userId: true,
				},
			});

			if (!applications.length) {
				const emptyEmbed = new EmbedBuilder()
					.setTitle(`📋 Заявки рекрута ${recruitUser.username}`)
					.setColor("Orange")
					.setDescription("Этот рекрут ещё не рассмотрел ни одной заявки.")
					.setThumbnail(recruitUser.displayAvatarURL())
					.setFooter({ text: "Видно только вам • by Evri" })
					.setTimestamp();

				return await interaction.editReply({ embeds: [emptyEmbed] });
			}

			const description = applications
				.map((app, index) => {
					const dateStr = app.createdAt.toLocaleDateString("ru-RU");

					let status = "🟡 На рассмотрении";
					if (app.isAccepted === true) status = "🟢 Принята";
					else if (app.isAccepted === false) status = "🔴 Отклонена";

					const reason =
						app.isAccepted === false
							? `\n> **Причина:** ${app.reason || "не указана"}`
							: "";

					return `**${index + 1}. ${dateStr}**
> **Пользователь:** <@${app.userId}>
> **Имя в заявке:** ${app.name}
> **Статус:** ${status}${reason}`;
				})
				.join("\n\n");

			const acceptedCount = applications.filter((a) => a.isAccepted === true).length;
			const declinedCount = applications.filter((a) => a.isAccepted === false).length;

			const embed = new EmbedBuilder()
				.setTitle(`📋 Заявки, рассмотренные ${recruitUser.username}`)
				.setColor("Blue")
				.setDescription(description)
				.setThumbnail(recruitUser.displayAvatarURL())
				.setFooter({
					text: `Принято: ${acceptedCount} • Отклонено: ${declinedCount} • Всего: ${applications.length} • Видно только вам • by Evri`,
				})
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (err) {
			console.error("Ошибка recruit:", err);

			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "Ошибка при получении заявок рекрута",
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.editReply({
					content: "Ошибка при получении заявок рекрута",
					embeds: [],
				});
			}
		}
	},
};