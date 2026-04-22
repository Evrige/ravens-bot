import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	AttachmentBuilder,
	EmbedBuilder,
} from "discord.js";
import { xpForNextLevel } from "../../utils/xpForNextLevel";
import { prisma } from "../../utils/prisma";
import { renderProfileCardPng } from "../../utils/profileCard";
import {formatTime} from "../../utils/time";
import {checkRolesOrReply} from "../../utils/checkRoles";
import {FAMILY_OWNERS_ROLE_IDS, FAMILY_STAFF_LIST_ROLE_IDS} from "../../config/staff";
import { getActiveAfkRecord, getImprovementStats, getLatestAfkRecord, getMarketOrderStats, listRecentMarketOrdersByUser } from "../../services/familyHistoryStore";
import { formatCoins, formatDate, formatDateTime } from "../../utils/formatters";
import { HiveStatus } from "../../generated/prisma/client";

function resolveRankName(interaction: ChatInputCommandInteraction, roleIds: string[]) {
	if (!interaction.guild || !roleIds.length) return "Без ранга";

	for (let index = roleIds.length - 1; index >= 0; index -= 1) {
		const roleId = roleIds[index];
		if (!roleId) continue;

		const role = interaction.guild.roles.cache.get(roleId);
		if (role) return role.name;
	}

	return "Без ранга";
}

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

		const [improvementStats, marketStats, activeAfk, latestAfk, acceptedContracts, recentOrders] = await Promise.all([
			getImprovementStats(target.id),
			getMarketOrderStats(target.id),
			getActiveAfkRecord(target.id),
			getLatestAfkRecord(target.id),
			prisma.hive.count({
				where: {
					userId: target.id,
					status: HiveStatus.ACCEPTED,
				},
			}).catch(() => 0),
			listRecentMarketOrdersByUser(target.id, 3),
		]);

		const rankRoleIds = FAMILY_STAFF_LIST_ROLE_IDS.filter((roleId) => member?.roles.cache.has(roleId));
		const rankName = resolveRankName(interaction, rankRoleIds);

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
		const summaryEmbed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`Профиль ${displayName}`)
			.setDescription(
				[
					`**Ранг:** ${rankName}`,
					`**Дата вступления:** ${formatDate(member?.joinedAt)}`,
					`**Баланс:** ${formatCoins(u.balance)} 🪙`,
					`**Войс:** ${voiceText}`,
				].join("\n")
			)
			.setImage("attachment://profile.png")
			.addFields(
				{
					name: "Заявки на повышение",
					value: [
						`Всего: **${improvementStats.total}**`,
						`Ожидают: **${improvementStats.pending}**`,
						`Одобрено: **${improvementStats.accepted}**`,
						`Отклонено: **${improvementStats.declined}**`,
					].join("\n"),
					inline: true,
				},
				{
					name: "Покупки в маркете",
					value: [
						`Всего: **${marketStats.total}**`,
						`Открыто: **${marketStats.pending}**`,
						`В работе: **${marketStats.inProgress}**`,
						`Выполнено: **${marketStats.completed}**`,
					].join("\n"),
					inline: true,
				},
				{
					name: "Активность",
					value: [
						`Сообщений: **${msgs}**`,
						`Контракты: **${acceptedContracts}**`,
						`Уровень: **${level}**`,
						`Предупреждения: **${u.warn}**`,
					].join("\n"),
					inline: true,
				},
				{
					name: "AFK",
					value: activeAfk
						? `Сейчас в AFK до **${formatDateTime(activeAfk.endAt)}**\nПричина: ${activeAfk.reason}`
						: latestAfk
							? `Последний AFK: **${latestAfk.status}**\nДо: ${formatDateTime(latestAfk.endAt)}`
							: "AFK ещё не использовался.",
					inline: false,
				},
				{
					name: "Последние покупки",
					value: recentOrders.length
						? recentOrders
							.map((order) => `• ${order.marketName} — **${order.status}**`)
							.join("\n")
						: "Покупок пока нет.",
					inline: false,
				}
			)
			.setFooter({ text: `XP: ${xp}/${need}` });

		await interaction.reply({
			embeds: [summaryEmbed],
			files: [file],
			ephemeral: true
		});
	}
};
