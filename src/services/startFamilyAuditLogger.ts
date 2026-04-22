import {
	AuditLogEvent,
	ChannelType,
	Client,
	Colors,
	EmbedBuilder,
	Guild,
	GuildBasedChannel,
	GuildMember,
	Message,
	Role,
	TextChannel,
	User,
	VoiceState,
} from "discord.js";
import { config } from "../config/env";
import { CHANNEL_IDS } from "../config/channels";
import { truncateText } from "../utils/formatters";

const AUDIT_LOOKBACK_MS = 15_000;
type ActorLike = { id: string; toString(): string } | null | undefined;

function isFamilyGuild(guild: Guild) {
	return guild.id === config.FAMILY_SERVER_GUID;
}

async function getFamilyLogChannel(guild: Guild): Promise<TextChannel | null> {
	if (!isFamilyGuild(guild)) return null;

	const channel = await guild.channels.fetch(CHANNEL_IDS.FAMILY_LOG).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return null;

	return channel as TextChannel;
}

async function sendAuditEmbed(guild: Guild, embed: EmbedBuilder) {
	const channel = await getFamilyLogChannel(guild);
	if (!channel) return;

	await channel.send({ embeds: [embed] }).catch((error) => {
		console.error("[family-audit] failed to send log:", error);
	});
}

function formatUser(user: ActorLike) {
	return user ? `${user} (\`${user.id}\`)` : "Не удалось определить";
}

function formatMember(member: GuildMember | null | undefined) {
	return member ? `${member} (\`${member.id}\`)` : "Не удалось определить";
}

function formatRole(role: Role | { id: string; name?: string } | null | undefined) {
	if (!role) return "Не удалось определить";

	if ("name" in role && role.name) {
		return `${role.name} (<@&${role.id}>)`;
	}

	return `<@&${role.id}>`;
}

function formatChannel(channel: GuildBasedChannel | { id: string; name?: string } | null | undefined) {
	if (!channel) return "Не удалось определить";

	if ("name" in channel && channel.name) {
		return `${channel.name} (<#${channel.id}>)`;
	}

	return `<#${channel.id}>`;
}

function formatValue(value: string | number | boolean | null | undefined) {
	if (value === null || value === undefined || value === "") return "Не задано";
	if (typeof value === "boolean") return value ? "Да" : "Нет";
	return String(value);
}

function formatPermissions(role: Role) {
	return role.permissions.toArray().map((permission) => `\`${permission}\``).join(", ") || "Нет";
}

function formatMessageContent(message: Message | PartialMessageLike) {
	if (!message.content?.trim()) {
		return message.attachments?.size ? "Сообщение без текста, только вложения." : "Текст недоступен.";
	}

	return truncateText(message.content, 1000);
}

type PartialMessageLike = {
	content?: string | null;
	attachments?: { size: number };
};

function buildBaseEmbed(title: string, color: number, executor: ActorLike, description: string) {
	return new EmbedBuilder()
		.setTitle(title)
		.setColor(color)
		.setDescription(description)
		.addFields({ name: "Исполнитель", value: formatUser(executor), inline: false })
		.setTimestamp();
}

async function findAuditEntry(
	guild: Guild,
	type: AuditLogEvent,
	matcher: (entry: any) => boolean,
) {
	try {
		const audit = await guild.fetchAuditLogs({ type, limit: 6 });
		const now = Date.now();

		return audit.entries.find((entry) => {
			if (now - entry.createdTimestamp > AUDIT_LOOKBACK_MS) return false;
			return matcher(entry);
		}) ?? null;
	} catch (error) {
		console.error("[family-audit] failed to fetch audit logs:", error);
		return null;
	}
}

function describeRoleChanges(oldRole: Role, newRole: Role) {
	const changes: string[] = [];

	if (oldRole.name !== newRole.name) {
		changes.push(`Название: \`${oldRole.name}\` -> \`${newRole.name}\``);
	}

	if (oldRole.color !== newRole.color) {
		changes.push(`Цвет: \`${oldRole.hexColor}\` -> \`${newRole.hexColor}\``);
	}

	if (oldRole.hoist !== newRole.hoist) {
		changes.push(`Отображать отдельно: ${formatValue(oldRole.hoist)} -> ${formatValue(newRole.hoist)}`);
	}

	if (oldRole.mentionable !== newRole.mentionable) {
		changes.push(`Упоминание: ${formatValue(oldRole.mentionable)} -> ${formatValue(newRole.mentionable)}`);
	}

	if (!oldRole.permissions.equals(newRole.permissions)) {
		changes.push(`Права обновлены\nБыло: ${formatPermissions(oldRole)}\nСтало: ${formatPermissions(newRole)}`);
	}

	return changes;
}

function describeChannelChanges(oldChannel: GuildBasedChannel, newChannel: GuildBasedChannel) {
	const changes: string[] = [];
	const oldAny = oldChannel as any;
	const newAny = newChannel as any;

	if (oldChannel.name !== newChannel.name) {
		changes.push(`Название: \`${oldChannel.name}\` -> \`${newChannel.name}\``);
	}

	if (oldAny.parentId !== newAny.parentId) {
		const oldParent = oldAny.parent?.name ?? "Нет категории";
		const newParent = newAny.parent?.name ?? "Нет категории";
		changes.push(`Категория: \`${oldParent}\` -> \`${newParent}\``);
	}

	if (typeof oldAny.topic === "string" || typeof newAny.topic === "string") {
		if ((oldAny.topic ?? null) !== (newAny.topic ?? null)) {
			changes.push(`Тема: ${formatValue(oldAny.topic)} -> ${formatValue(newAny.topic)}`);
		}
	}

	if (typeof oldAny.rateLimitPerUser === "number" || typeof newAny.rateLimitPerUser === "number") {
		if ((oldAny.rateLimitPerUser ?? 0) !== (newAny.rateLimitPerUser ?? 0)) {
			changes.push(
				`Slowmode: \`${oldAny.rateLimitPerUser ?? 0}\`с -> \`${newAny.rateLimitPerUser ?? 0}\`с`
			);
		}
	}

	if (typeof oldAny.userLimit === "number" || typeof newAny.userLimit === "number") {
		if ((oldAny.userLimit ?? 0) !== (newAny.userLimit ?? 0)) {
			changes.push(`Лимит пользователей: \`${oldAny.userLimit ?? 0}\` -> \`${newAny.userLimit ?? 0}\``);
		}
	}

	if (typeof oldAny.bitrate === "number" || typeof newAny.bitrate === "number") {
		if ((oldAny.bitrate ?? 0) !== (newAny.bitrate ?? 0)) {
			changes.push(`Битрейт: \`${oldAny.bitrate ?? 0}\` -> \`${newAny.bitrate ?? 0}\``);
		}
	}

	if (oldAny.nsfw !== undefined || newAny.nsfw !== undefined) {
		if ((oldAny.nsfw ?? false) !== (newAny.nsfw ?? false)) {
			changes.push(`NSFW: ${formatValue(oldAny.nsfw)} -> ${formatValue(newAny.nsfw)}`);
		}
	}

	return changes;
}

export function startFamilyAuditLogger(client: Client) {
	client.on("roleCreate", async (role) => {
		if (!isFamilyGuild(role.guild)) return;

		const entry = await findAuditEntry(
			role.guild,
			AuditLogEvent.RoleCreate,
			(auditEntry) => auditEntry.target?.id === role.id,
		);

		const embed = buildBaseEmbed(
			"Создана роль",
			Colors.Green,
			entry?.executor ?? null,
			`Создана роль ${formatRole(role)}`
		).addFields(
			{ name: "Цвет", value: `\`${role.hexColor}\``, inline: true },
			{ name: "Отображать отдельно", value: formatValue(role.hoist), inline: true },
			{ name: "Можно упоминать", value: formatValue(role.mentionable), inline: true },
		);

		await sendAuditEmbed(role.guild, embed);
	});

	client.on("roleDelete", async (role) => {
		if (!isFamilyGuild(role.guild)) return;

		const entry = await findAuditEntry(
			role.guild,
			AuditLogEvent.RoleDelete,
			(auditEntry) => auditEntry.target?.id === role.id,
		);

		const embed = buildBaseEmbed(
			"Удалена роль",
			Colors.Red,
			entry?.executor ?? null,
			`Удалена роль \`${role.name}\` (\`${role.id}\`)`
		).addFields(
			{ name: "Цвет", value: `\`${role.hexColor}\``, inline: true },
			{ name: "Права", value: formatPermissions(role).slice(0, 1024), inline: false },
		);

		await sendAuditEmbed(role.guild, embed);
	});

	client.on("roleUpdate", async (oldRole, newRole) => {
		if (!isFamilyGuild(newRole.guild)) return;

		const changes = describeRoleChanges(oldRole, newRole);
		if (!changes.length) return;

		const entry = await findAuditEntry(
			newRole.guild,
			AuditLogEvent.RoleUpdate,
			(auditEntry) => auditEntry.target?.id === newRole.id,
		);

		const embed = buildBaseEmbed(
			"Обновлена роль",
			Colors.Yellow,
			entry?.executor ?? null,
			`Изменена роль ${formatRole(newRole)}`
		).addFields({
			name: "Изменения",
			value: changes.join("\n").slice(0, 1024),
			inline: false,
		});

		await sendAuditEmbed(newRole.guild, embed);
	});

	client.on("guildMemberUpdate", async (oldMember, newMember) => {
		if (!isFamilyGuild(newMember.guild)) return;

		const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
		const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

		if (!addedRoles.size && !removedRoles.size) {
			return;
		}

		const entry = await findAuditEntry(
			newMember.guild,
			AuditLogEvent.MemberRoleUpdate,
			(auditEntry) =>
				auditEntry.target?.id === newMember.id &&
				Array.isArray(auditEntry.changes) &&
				auditEntry.changes.some((change: any) => change.key === "$add" || change.key === "$remove"),
		);

		const addedText = addedRoles.map((role) => formatRole(role)).join("\n") || "Нет";
		const removedText = removedRoles.map((role) => formatRole(role)).join("\n") || "Нет";

		const embed = buildBaseEmbed(
			"Изменены роли участника",
			Colors.Blurple,
			entry?.executor ?? null,
			`Изменены роли у ${formatMember(newMember)}`
		).addFields(
			{ name: "Выданы роли", value: addedText.slice(0, 1024), inline: true },
			{ name: "Сняты роли", value: removedText.slice(0, 1024), inline: true },
		);

		await sendAuditEmbed(newMember.guild, embed);
	});

	client.on("channelCreate", async (channel) => {
		if (!("guild" in channel)) return;
		if (!isFamilyGuild(channel.guild)) return;

		const entry = await findAuditEntry(
			channel.guild,
			AuditLogEvent.ChannelCreate,
			(auditEntry) => auditEntry.target?.id === channel.id,
		);

		const embed = buildBaseEmbed(
			"Создан канал",
			Colors.Green,
			entry?.executor ?? null,
			`Создан канал ${formatChannel(channel)}`
		).addFields(
			{ name: "Тип", value: `\`${ChannelType[channel.type] ?? channel.type}\``, inline: true },
			{ name: "Категория", value: channel.parent?.name ?? "Нет категории", inline: true },
		);

		await sendAuditEmbed(channel.guild, embed);
	});

	client.on("channelDelete", async (channel) => {
		if (!("guild" in channel)) return;
		if (!isFamilyGuild(channel.guild)) return;

		const entry = await findAuditEntry(
			channel.guild,
			AuditLogEvent.ChannelDelete,
			(auditEntry) => auditEntry.target?.id === channel.id,
		);

		const embed = buildBaseEmbed(
			"Удалён канал",
			Colors.Red,
			entry?.executor ?? null,
			`Удалён канал \`${channel.name}\` (\`${channel.id}\`)`
		).addFields(
			{ name: "Тип", value: `\`${ChannelType[channel.type] ?? channel.type}\``, inline: true },
			{ name: "Категория", value: channel.parent?.name ?? "Нет категории", inline: true },
		);

		await sendAuditEmbed(channel.guild, embed);
	});

	client.on("channelUpdate", async (oldChannel, newChannel) => {
		if (!("guild" in oldChannel) || !("guild" in newChannel)) return;
		if (!isFamilyGuild(newChannel.guild)) return;

		const changes = describeChannelChanges(oldChannel as GuildBasedChannel, newChannel as GuildBasedChannel);
		if (!changes.length) return;

		const entry = await findAuditEntry(
			newChannel.guild,
			AuditLogEvent.ChannelUpdate,
			(auditEntry) => auditEntry.target?.id === newChannel.id,
		);

		const embed = buildBaseEmbed(
			"Обновлён канал",
			Colors.Yellow,
			entry?.executor ?? null,
			`Изменён канал ${formatChannel(newChannel)}`
		).addFields({
			name: "Изменения",
			value: changes.join("\n").slice(0, 1024),
			inline: false,
		});

		await sendAuditEmbed(newChannel.guild, embed);
	});

	client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
		if (!newState.guild || !isFamilyGuild(newState.guild)) return;
		if (!oldState.channelId || !newState.channelId) return;
		if (oldState.channelId === newState.channelId) return;

		const entry = await findAuditEntry(
			newState.guild,
			AuditLogEvent.MemberMove,
			(auditEntry) =>
				auditEntry.target?.id === newState.id &&
				(auditEntry.extra?.channel?.id === newState.channelId || auditEntry.extra?.channel?.id === oldState.channelId),
		);

		if (!entry?.executor || entry.executor.id === newState.id) {
			return;
		}

		const embed = buildBaseEmbed(
			"Участник перемещён",
			Colors.Orange,
			entry.executor,
			`${formatMember(newState.member ?? oldState.member ?? null)} был перемещён по голосовым каналам`
		).addFields(
			{ name: "Из канала", value: formatChannel(oldState.channel), inline: true },
			{ name: "В канал", value: formatChannel(newState.channel), inline: true },
		);

		await sendAuditEmbed(newState.guild, embed);
	});

	client.on("messageDelete", async (message: any) => {
		if (!message.guild || !isFamilyGuild(message.guild)) return;
		if (message.author?.bot) return;

		const entry = await findAuditEntry(
			message.guild,
			AuditLogEvent.MessageDelete,
			(auditEntry) =>
				auditEntry.target?.id === message.author?.id &&
				auditEntry.extra?.channel?.id === message.channelId,
		);

		const embed = buildBaseEmbed(
			"Удалено сообщение",
			Colors.Red,
			entry?.executor ?? message.author ?? null,
			`Сообщение удалено в канале <#${message.channelId}>`
		).addFields(
			{
				name: "Автор",
				value: formatUser(message.author ?? null),
				inline: true,
			},
			{
				name: "Канал",
				value: `<#${message.channelId}>`,
				inline: true,
			},
			{
				name: "Содержимое",
				value: formatMessageContent(message),
				inline: false,
			},
		);

		if (message.attachments.size) {
			embed.addFields({
				name: "Вложения",
				value: truncateText(
					message.attachments
						.map((attachment: { url: string }) => attachment.url)
						.join("\n"),
					1000
				),
				inline: false,
			});
		}

		await sendAuditEmbed(message.guild, embed);
	});

	client.on("messageUpdate", async (oldMessage: any, newMessage: any) => {
		if (!newMessage.guild || !isFamilyGuild(newMessage.guild)) return;
		if (newMessage.author?.bot) return;

		const before = oldMessage.content ?? "";
		const after = newMessage.content ?? "";
		if (before === after) return;

		const embed = buildBaseEmbed(
			"Изменено сообщение",
			Colors.Yellow,
			newMessage.author ?? null,
			`Сообщение изменено в канале <#${newMessage.channelId}>`
		).addFields(
			{
				name: "Автор",
				value: formatUser(newMessage.author ?? oldMessage.author ?? null),
				inline: true,
			},
			{
				name: "До",
				value: truncateText(before || "Текст недоступен.", 1000),
				inline: false,
			},
			{
				name: "После",
				value: truncateText(after || "Текст недоступен.", 1000),
				inline: false,
			},
		);

		await sendAuditEmbed(newMessage.guild, embed);
	});
}
