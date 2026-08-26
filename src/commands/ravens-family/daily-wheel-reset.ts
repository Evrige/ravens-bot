import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { resetDailyWheelCooldown } from "../../services/dailyWheelService";
import { checkRolesOrReply } from "../../utils/checkRoles";

export const dailyWheelResetCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DAILY_WHEEL_RESET)
		.setDescription("Сбросить таймер ежедневного колеса пользователю")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("Пользователь, которому нужно сбросить таймер")
				.setRequired(true)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) return;

		const target = interaction.options.getUser("user", true);
		const deleted = await resetDailyWheelCooldown(target.id);

		await interaction.reply({
			content: deleted.count
				? `✅ Таймер колеса для <@${target.id}> сброшен. Пользователь может крутить бесплатно.`
				: `ℹ️ У <@${target.id}> не было активного таймера колеса.`,
			flags: MessageFlags.Ephemeral,
			allowedMentions: { users: [target.id] },
		});
	},
};
