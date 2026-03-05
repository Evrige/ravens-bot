import {SlashCommandBuilder, ChatInputCommandInteraction, Client} from "discord.js";
import {prisma} from "../../utils/prisma";
import {CUSTOM_COMMAND} from "../../constants/customIds";
import {FAMILY_PANEL, upsertFamilyListPanel} from "../../services/upsertFamilyListPanel";

export const familyPanelReset = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FAMILY_PANEL)
		.setDescription("Пересоздать панель семей"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const res = await resetFamilyPanel(interaction.client);

		await interaction.editReply(
			res.ok ? "✅ Панель пересоздана" : `❌ Ошибка: ${res.reason}`
		);
	},
};

export async function resetFamilyPanel(client: Client) {
	await prisma.botMessage.deleteMany({
		where: { type: FAMILY_PANEL.BOTMSG_TYPE },
	});

	return await upsertFamilyListPanel(client);
}