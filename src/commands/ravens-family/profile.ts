import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	AttachmentBuilder
} from "discord.js";
import { xpForNextLevel } from "../../utils/xpForNextLevel";
import { prisma } from "../../utils/prisma";
import { renderProfileCardPng } from "../../utils/profileCard";
import {formatTime} from "../../utils/time";
import {checkRolesOrReply} from "../../utils/checkRoles";
import {FAMILY_OWNERS_ROLE_IDS} from "../../config/staff";

export const profileCommand = {
	data: new SlashCommandBuilder()
		.setName("profile")
		.setDescription("Показать профиль")
		.addUserOption((o) =>
			o.setName("user").setDescription("Чей профиль").setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user") ?? interaction.user;
		// 🚫 Если пытается смотреть чужой профиль
		if (target.id !== interaction.user.id) {
			if (!(await checkRolesOrReply(interaction, FAMILY_OWNERS_ROLE_IDS))) {
				return interaction.reply({
					content: "❌ Вы не можете смотреть чужой профиль.",
					ephemeral: true
				});
			}
		}
		if (!interaction.guild) {
			return interaction.reply({ content: "❌ Только на сервере.", ephemeral: true });
		}

		const member = await interaction.guild.members.fetch(target.id).catch(() => null);
		const displayName = member?.displayName ?? target.username;

		const u = await prisma.user.upsert({
			where: { id: target.id },
			create: { id: target.id },
			update: {}
		});

		const level = u.level;
		const xp = Number(u.xp ?? 0n);
		const need = xpForNextLevel(level);

		const voiceText = formatTime(u.timeInVoice);
		const msgs = u.messageCount.toString();
		const coins = Math.floor(Number(u.balance));

		const png = await renderProfileCardPng({
			username: displayName,
			level,
			isMarry: u.isMarry, // ✅ вот это
			xp,
			need,
			voiceText,
			msgs,
			coins,
			warns: u.warn,
			mute: u.isMute,
			ban: u.isBan,
			avatarUrl: target.displayAvatarURL({
				size: 256,
				extension: "png",
				forceStatic: true
			})
		});

		const file = new AttachmentBuilder(png, { name: "profile.png" });

		await interaction.reply({
			files: [file],
			ephemeral: true
		});
	}
};