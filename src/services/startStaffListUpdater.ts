import { prisma } from "../utils/prisma";
import { EmbedBuilder } from "discord.js";
import { client } from "../index";
import {
	FAMILY_HIGH_ROLE_IDS,
	FAMILY_RECRUIT_ROLE_IDS,
	FAMILY_USER_ROLE_IDS
} from "../config/staff";

export async function startStaffListUpdater() {
	const data = await prisma.botMessage.findUnique({
		where: { type: "staff_list" }
	});
	if (!data) return;

	const channel = await client.channels.fetch(data.channelId).catch(() => null);
	if (!channel?.isTextBased()) return;

	const message = await channel.messages.fetch(data.messageId).catch(() => null);
	if (!message) return;

	const generateEmbed = async () => {
		const guild = message.guild;
		if (!guild) return null;


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

		return new EmbedBuilder()
			.setTitle("Семья")
			.setColor("Purple")
			.setDescription(description || "Нет участников с STAFF ролями")
			.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
			.setTimestamp();
	};

	const update = async () => {
		const embed = await generateEmbed();
		if (!embed) return;
		await message.edit({ embeds: [embed] }).catch(() => {});
	};

	// Обновляем сразу
	await update();

	// 🔄 Каждые 4 часа
	setInterval(update, 4 * 60 * 60 * 1000);
}