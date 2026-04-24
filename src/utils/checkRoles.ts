import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

/**
 * Проверяет, есть ли у пользователя хотя бы одна из нужных ролей.
 * @param interaction — объект команды Discord
 * @param allowedRoles — массив ID ролей, которые разрешены
 * @returns true, если есть доступ, false — если нет
 */
export function hasAllowedRole(interaction: ChatInputCommandInteraction, allowedRoles: string[]): boolean {
	const memberRoles = (interaction.member?.roles as any)?.cache?.map((r: any) => r.id) || [];
	return memberRoles.some((roleId: string) => allowedRoles.includes(roleId));
}

/**
 * Проверка с автоматическим ответом, если нет прав
 */
export async function checkRolesOrReply(interaction: ChatInputCommandInteraction, allowedRoles: string[]): Promise<boolean> {
	if (!hasAllowedRole(interaction, allowedRoles)) {
		if (interaction.deferred || interaction.replied) {
			await interaction.editReply({
				content: "❌ У тебя нет прав на использование этой команды",
			}).catch(() => null);
		} else {
			await interaction.reply({
				content: "❌ У тебя нет прав на использование этой команды",
				flags: MessageFlags.Ephemeral,
			}).catch(() => null);
		}
		return false;
	}
	return true;
}
