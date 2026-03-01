import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { repostStaffList } from "../../services/updateStaffList";

export const staffListCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.STAFF_LIST)
		.setDescription("Пересоздать STAFF list в этом канале"),

	async execute(interaction: ChatInputCommandInteraction) {
		// ✅ СРАЗУ ACK, иначе Discord убьёт команду
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		// ✅ Проверка прав уже после defer
		const ok = await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS);
		if (!ok) return; // checkRolesOrReply сам ответит/отредактирует

		try {
			await repostStaffList(interaction.client, interaction.channelId);

			// если хочешь без ответа — лучше всё равно кратко ответить и удалить
			await interaction.editReply("✅ STAFF list пересоздан.").catch(() => {});
			// или полностью без ответа в чат:
			// await interaction.deleteReply().catch(() => {});
		} catch (e) {
			console.error("staff-list error:", e);
			await interaction.editReply("❌ Ошибка при пересоздании STAFF list.").catch(() => {});
		}
	},
};