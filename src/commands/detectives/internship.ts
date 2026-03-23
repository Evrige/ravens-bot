import {
	ChatInputCommandInteraction,
	GuildMember,
	SlashCommandBuilder,
	User,
} from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { DB_STAFF_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import {createInternshipThreadAndAssignRole} from "../../utils/detectives/createInternshipThreadAndAssignRole";

export const internshipCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DB_INTERNSHIP)
		.setDescription("Создать ветку стажировки для сотрудника")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("Сотрудник, для которого создать стажировку")
				.setRequired(true)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, DB_STAFF_ROLE_IDS))) return;

		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		const guild = interaction.guild;
		if (!guild) {
			return interaction.editReply("❌ Команда доступна только на сервере.");
		}

		const targetUser = interaction.options.getUser("user", true);

		let targetMember: GuildMember;
		try {
			targetMember = await guild.members.fetch(targetUser.id);
		} catch {
			return interaction.editReply("❌ Пользователь не найден на сервере.");
		}

		try {
			const result = await createInternshipThreadAndAssignRole({
				interaction,
				targetUser,
				targetMember,
			});

			return interaction.editReply(
				`✅ Ветка стажировки создана: ${result.threadUrl}\n` +
				`👤 Сотрудник: ${targetMember.displayName}\n` +
				`🎭 Роль стажировки выдана.`
			);
		} catch (error) {
			console.error("[internshipCommand] error:", error);
			return interaction.editReply("❌ Не удалось создать ветку стажировки.");
		}
	},
};