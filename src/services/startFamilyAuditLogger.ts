import {
	AuditLogEvent,
	ChannelType,
	Client,
	Colors,
	EmbedBuilder,
	ForumChannel,
	Guild,
	GuildBasedChannel,
	GuildMember,
	Message,
	Role,
	TextChannel,
	ThreadAutoArchiveDuration,
	ThreadChannel,
	User,
	VoiceState,
} from "discord.js";
import { config } from "../config/env";
import { CHANNEL_IDS } from "../config/channels";
import { truncateText } from "../utils/formatters";
import { prisma } from "../utils/prisma";

const AUDIT_LOOKBACK_MS = 15_000;
const MESSAGE_CACHE_LIMIT = 1500;
const THREAD_TYPE_PREFIX = "family_audit_forum_";

type ActorLike = { id: string; toString(): string } | null | undefined;
type AuditBucket =
	| "message-delete"
	| "message-edit"
	| "roles"
	| "channels"
	| "voice"
	| "members"
	| "moderation"
	| "balance"
	| "promo";

type CachedMessageSnapshot = {
	id: string;
	guildId: string;
	channelId: string;
	authorId: string | null;
	authorLabel: string;
	content: string;
	attachments: string[];
};

type PartialMessageLike = {
	content?: string | null;
	attachments?: { size: number };
};

const THREAD_NAMES: Record<AuditBucket, string> = {
	"message-delete": "Удаление сообщений",
	"message-edit": "Изменение сообщений",
	roles: "Роли и доступы",
	channels: "Каналы и структура",
	voice: "Голосовые действия",
	members: "Участники и профили",
	moderation: "Модерация и наказания",
	balance: "Баланс и монеты",
	promo: "Промо",
};

const THREAD_DESCRIPTIONS: Record<AuditBucket, string> = {
	"message-delete": "Служебная тема для логов удаления сообщений.",
	"message-edit": "Служебная тема для логов редактирования сообщений.",
	roles: "Служебная тема для логов ролей и изменений доступа.",
	channels: "Служебная тема для логов каналов и категорий.",
	voice: "Служебная тема для логов голосовых действий.",
	members: "Служебная тема для логов входа, выхода и изменений профилей участников.",
	moderation: "Служебная тема для логов банов, киков, таймаутов и других модерационных действий.",
	balance: "Служебная тема для логов операций с балансом и монетами.",
	promo: "Служебная тема для логов промо-заявок и подтверждений.",
};

const messageCache = new Map<string, CachedMessageSnapshot>();

function isFamilyGuild(guild: Guild) {
	return guild.id === config.FAMILY_SERVER_GUID;
}

function isFamilyAuditServiceChannel(channel: GuildBasedChannel | null | undefined) {
	if (!channel) return false;

	const parentId = (channel as any).parentId ?? null;
	if (parentId !== CHANNEL_IDS.FAMILY_LOG) return false;

	if (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread) {
		return false;
	}

	return (Object.values(THREAD_NAMES) as string[]).includes(channel.name);
}

function getThreadType(bucket: AuditBucket) {
	return `${THREAD_TYPE_PREFIX}${bucket}`;
}

function rememberMessageSnapshot(snapshot: CachedMessageSnapshot) {
	messageCache.set(snapshot.id, snapshot);

	if (messageCache.size <= MESSAGE_CACHE_LIMIT) return;

	const oldestKey = messageCache.keys().next().value;
	if (oldestKey) {
		messageCache.delete(oldestKey);
	}
}

function snapshotFromMessage(message: any): CachedMessageSnapshot | null {
	if (!message.guildId || !message.channelId || !message.id) return null;

	const attachments = message.attachments?.size
		? Array.from(message.attachments.values()).map((attachment: any) => attachment.url).filter(Boolean)
		: [];

	return {
		id: message.id,
		guildId: message.guildId,
		channelId: message.channelId,
		authorId: message.author?.id ?? null,
		authorLabel: message.author ? `${message.author} (\`${message.author.id}\`)` : "Не удалось определить",
		content: message.content ?? "",
		attachments,
	};
}

function formatUser(user: ActorLike) {
	return user ? `${user} (\`${user.id}\`)` : "Не удалось определить";
}

function formatMember(member: GuildMember | null | undefined) {
	return member ? `${member} (\`${member.id}\`)` : "Не удалось определить";
}

function formatMemberLike(member: { id: string; toString(): string } | null | undefined) {
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

function formatMessageContent(message: Message | PartialMessageLike, snapshot?: CachedMessageSnapshot | null) {
	const content = message.content?.trim() || snapshot?.content?.trim();
	if (!content) {
		const attachmentCount = message.attachments?.size ?? snapshot?.attachments.length ?? 0;
		return attachmentCount ? "Сообщение без текста, только вложения." : "Текст недоступен.";
	}

	return truncateText(content, 1000);
}

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
		const audit = await guild.fetchAuditLogs({ type, limit: 8 });
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

function formatOverwriteTarget(channel: GuildBasedChannel, overwriteId: string) {
	const role = channel.guild.roles.cache.get(overwriteId);
	if (role) return formatRole(role);
	return `<@${overwriteId}>`;
}

function formatOverwritePermissions(overwrite: any) {
	const allow = overwrite?.allow?.toArray?.() ?? [];
	const deny = overwrite?.deny?.toArray?.() ?? [];

	const parts: string[] = [];
	if (allow.length) parts.push(`allow: ${allow.map((value: string) => `\`${value}\``).join(", ")}`);
	if (deny.length) parts.push(`deny: ${deny.map((value: string) => `\`${value}\``).join(", ")}`);
	return parts.join(" | ") || "Нет прав";
}

function describeOverwriteChanges(oldChannel: GuildBasedChannel, newChannel: GuildBasedChannel) {
	const oldCache = (oldChannel as any).permissionOverwrites?.cache;
	const newCache = (newChannel as any).permissionOverwrites?.cache;
	if (!oldCache || !newCache) return [];

	const ids = new Set<string>([
		...(Array.from(oldCache.keys()) as string[]),
		...(Array.from(newCache.keys()) as string[]),
	]);

	const changes: string[] = [];
	for (const overwriteId of ids) {
		const before = oldCache.get(overwriteId);
		const after = newCache.get(overwriteId);
		const target = formatOverwriteTarget(newChannel, overwriteId);

		if (!before && after) {
			changes.push(`Добавлен доступ для ${target}\n${formatOverwritePermissions(after)}`);
			continue;
		}

		if (before && !after) {
			changes.push(`Удалён доступ для ${target}`);
			continue;
		}

		if (!before || !after) continue;

		const beforeAllow = String(before.allow?.bitfield ?? "");
		const beforeDeny = String(before.deny?.bitfield ?? "");
		const afterAllow = String(after.allow?.bitfield ?? "");
		const afterDeny = String(after.deny?.bitfield ?? "");

		if (beforeAllow !== afterAllow || beforeDeny !== afterDeny) {
			changes.push(
				`Изменён доступ для ${target}\nБыло: ${formatOverwritePermissions(before)}\nСтало: ${formatOverwritePermissions(after)}`
			);
		}
	}

	return changes;
}

async function resolveFamilyLogTarget(guild: Guild) {
	if (!isFamilyGuild(guild)) return null;

	const channel = await guild.channels.fetch(CHANNEL_IDS.FAMILY_LOG).catch(() => null);
	if (!channel) return null;

	if (channel.type === ChannelType.GuildForum) {
		return { kind: "forum" as const, channel: channel as ForumChannel };
	}

	if (channel.type === ChannelType.GuildText) {
		return { kind: "text" as const, channel: channel as TextChannel };
	}

	return null;
}

function pickAppliedTagsIfRequired(forum: ForumChannel) {
	const tags = (forum as any).availableTags as Array<{ id: string; name: string }> | undefined;
	if (!tags?.length) return undefined;
	return [tags[0].id];
}

async function ensureAuditThread(forum: ForumChannel, bucket: AuditBucket) {
	const type = getThreadType(bucket);
	const stored = await prisma.botMessage.findUnique({ where: { type } });

	if (stored?.messageId) {
		const existing = await forum.client.channels.fetch(stored.messageId).catch(() => null);
		if (existing?.isThread()) {
			const thread = existing as ThreadChannel;
			if (thread.archived) await thread.setArchived(false).catch(() => null);
			if (thread.locked) await thread.setLocked(false).catch(() => null);
			return thread;
		}
	}

	const targetName = THREAD_NAMES[bucket];
	const active = await forum.threads.fetchActive().catch(() => null);
	const activeFound = active?.threads.find((thread) => thread.name === targetName);
	if (activeFound) {
		await prisma.botMessage.upsert({
			where: { type },
			update: { messageId: activeFound.id, channelId: forum.id },
			create: { type, messageId: activeFound.id, channelId: forum.id },
		});
		return activeFound as ThreadChannel;
	}

	const archived = await forum.threads.fetchArchived({ type: "public", fetchAll: true }).catch(() => null);
	const archivedFound = archived?.threads.find((thread) => thread.name === targetName);
	if (archivedFound) {
		await archivedFound.setArchived(false).catch(() => null);
		await archivedFound.setLocked(false).catch(() => null);
		await prisma.botMessage.upsert({
			where: { type },
			update: { messageId: archivedFound.id, channelId: forum.id },
			create: { type, messageId: archivedFound.id, channelId: forum.id },
		});
		return archivedFound as ThreadChannel;
	}

	const appliedTags = pickAppliedTagsIfRequired(forum);
	const created = await forum.threads.create({
		name: targetName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		message: { content: THREAD_DESCRIPTIONS[bucket] },
		...(appliedTags ? { appliedTags } : {}),
	});

	await prisma.botMessage.upsert({
		where: { type },
		update: { messageId: created.id, channelId: forum.id },
		create: { type, messageId: created.id, channelId: forum.id },
	});

	return created;
}

async function sendAuditEmbed(guild: Guild, bucket: AuditBucket, embed: EmbedBuilder) {
	const target = await resolveFamilyLogTarget(guild);
	if (!target) return;

	try {
		if (target.kind === "text") {
			await target.channel.send({ embeds: [embed] });
			return;
		}

		const thread = await ensureAuditThread(target.channel, bucket);
		await thread.send({ embeds: [embed] });
	} catch (error) {
		console.error("[family-audit] failed to send log:", error);
	}
}

export async function sendFamilyAuditCustomEmbed(
	client: Client,
	bucket: AuditBucket,
	embed: EmbedBuilder
) {
	const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
	if (!guild || !isFamilyGuild(guild)) return;

	await sendAuditEmbed(guild, bucket, embed);
}

export function startFamilyAuditLogger(client: Client) {
	client.on("guildMemberAdd", async (member) => {
		if (!isFamilyGuild(member.guild)) return;

		const embed = buildBaseEmbed(
			"Участник вошёл на сервер",
			Colors.Green,
			null,
			`${formatMember(member)} присоединился к серверу`
		).addFields(
			{ name: "Аккаунт создан", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:f>`, inline: true },
			{ name: "Всего участников", value: `\`${member.guild.memberCount}\``, inline: true },
		);

		await sendAuditEmbed(member.guild, "members", embed);
	});

	client.on("guildMemberRemove", async (member) => {
		if (!isFamilyGuild(member.guild)) return;

		const kickEntry = await findAuditEntry(
			member.guild,
			AuditLogEvent.MemberKick,
			(auditEntry) => auditEntry.target?.id === member.id,
		);

		if (kickEntry) {
			const embed = buildBaseEmbed(
				"Участник кикнут",
				Colors.Red,
				kickEntry.executor ?? null,
				`${formatMemberLike(member)} был кикнут с сервера`
			);

			await sendAuditEmbed(member.guild, "moderation", embed);
			return;
		}

		const embed = buildBaseEmbed(
			"Участник покинул сервер",
			Colors.Orange,
			null,
			`${formatMemberLike(member)} покинул сервер`
		);

		await sendAuditEmbed(member.guild, "members", embed);
	});

	client.on("messageCreate", (message) => {
		if (!message.guild || !isFamilyGuild(message.guild) || message.author?.bot) return;
		const snapshot = snapshotFromMessage(message);
		if (snapshot) rememberMessageSnapshot(snapshot);
	});

	client.on("messageUpdate", (oldMessage: any, newMessage: any) => {
		if (!newMessage.guild || !isFamilyGuild(newMessage.guild) || newMessage.author?.bot) return;

		const snapshot = snapshotFromMessage(newMessage) ?? snapshotFromMessage(oldMessage);
		if (snapshot) rememberMessageSnapshot(snapshot);
	});

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

		await sendAuditEmbed(role.guild, "roles", embed);
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
			{ name: "Права", value: truncateText(formatPermissions(role), 1024), inline: false },
		);

		await sendAuditEmbed(role.guild, "roles", embed);
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
			value: truncateText(changes.join("\n"), 1024),
			inline: false,
		});

		await sendAuditEmbed(newRole.guild, "roles", embed);
	});

	client.on("guildMemberUpdate", async (oldMember, newMember) => {
		if (!isFamilyGuild(newMember.guild)) return;

		const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
		const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
		if (!addedRoles.size && !removedRoles.size) return;

		const entry = await findAuditEntry(
			newMember.guild,
			AuditLogEvent.MemberRoleUpdate,
			(auditEntry) =>
				auditEntry.target?.id === newMember.id &&
				Array.isArray(auditEntry.changes) &&
				auditEntry.changes.some((change: any) => change.key === "$add" || change.key === "$remove"),
		);

		const embed = buildBaseEmbed(
			"Изменены роли участника",
			Colors.Blurple,
			entry?.executor ?? null,
			`Изменены роли у ${formatMember(newMember)}`
		).addFields(
			{ name: "Выданы роли", value: truncateText(addedRoles.map((role) => formatRole(role)).join("\n") || "Нет", 1024), inline: true },
			{ name: "Сняты роли", value: truncateText(removedRoles.map((role) => formatRole(role)).join("\n") || "Нет", 1024), inline: true },
		);

		await sendAuditEmbed(newMember.guild, "roles", embed);

		if ((oldMember.nickname ?? null) !== (newMember.nickname ?? null)) {
			const entry = await findAuditEntry(
				newMember.guild,
				AuditLogEvent.MemberUpdate,
				(auditEntry) => auditEntry.target?.id === newMember.id,
			);

			const nickEmbed = buildBaseEmbed(
				"Изменён ник участника",
				Colors.Blurple,
				entry?.executor ?? null,
				`Обновлён ник у ${formatMember(newMember)}`
			).addFields(
				{ name: "Было", value: formatValue(oldMember.nickname), inline: true },
				{ name: "Стало", value: formatValue(newMember.nickname), inline: true },
			);

			await sendAuditEmbed(newMember.guild, "members", nickEmbed);
		}

		const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? null;
		const newTimeout = newMember.communicationDisabledUntilTimestamp ?? null;
		if (oldTimeout !== newTimeout) {
			const entry = await findAuditEntry(
				newMember.guild,
				AuditLogEvent.MemberUpdate,
				(auditEntry) => auditEntry.target?.id === newMember.id,
			);

			const isRemoved = !newTimeout;
			const timeoutEmbed = buildBaseEmbed(
				isRemoved ? "Снят таймаут" : "Выдан таймаут",
				isRemoved ? Colors.Green : Colors.Red,
				entry?.executor ?? null,
				`${formatMember(newMember)} ${isRemoved ? "снят с таймаута" : "получил таймаут"}`
			).addFields(
				{ name: "Было", value: oldTimeout ? `<t:${Math.floor(oldTimeout / 1000)}:f>` : "Не было", inline: true },
				{ name: "Стало", value: newTimeout ? `<t:${Math.floor(newTimeout / 1000)}:f>` : "Снято", inline: true },
			);

			await sendAuditEmbed(newMember.guild, "moderation", timeoutEmbed);
		}
	});

	client.on("channelCreate", async (channel) => {
		if (!("guild" in channel) || !isFamilyGuild(channel.guild)) return;
		if (isFamilyAuditServiceChannel(channel as GuildBasedChannel)) return;

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

		await sendAuditEmbed(channel.guild, "channels", embed);
	});

	client.on("channelDelete", async (channel) => {
		if (!("guild" in channel) || !isFamilyGuild(channel.guild)) return;
		if (isFamilyAuditServiceChannel(channel as GuildBasedChannel)) return;

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

		await sendAuditEmbed(channel.guild, "channels", embed);
	});

	client.on("channelUpdate", async (oldChannel, newChannel) => {
		if (!("guild" in oldChannel) || !("guild" in newChannel) || !isFamilyGuild(newChannel.guild)) return;
		if (isFamilyAuditServiceChannel(newChannel as GuildBasedChannel)) return;

		const changes = [
			...describeChannelChanges(oldChannel as GuildBasedChannel, newChannel as GuildBasedChannel),
			...describeOverwriteChanges(oldChannel as GuildBasedChannel, newChannel as GuildBasedChannel),
		];
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
			value: truncateText(changes.join("\n"), 1024),
			inline: false,
		});

		await sendAuditEmbed(newChannel.guild, "channels", embed);
	});

	client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
		if (!newState.guild || !isFamilyGuild(newState.guild)) return;

		if (oldState.channelId !== newState.channelId) {
			if (oldState.channelId && newState.channelId) {
				const entry = await findAuditEntry(
					newState.guild,
					AuditLogEvent.MemberMove,
					(auditEntry) =>
						auditEntry.target?.id === newState.id &&
						(auditEntry.extra?.channel?.id === newState.channelId || auditEntry.extra?.channel?.id === oldState.channelId),
				);

				if (entry?.executor && entry.executor.id !== newState.id) {
					const embed = buildBaseEmbed(
						"Участник перемещён",
						Colors.Orange,
						entry.executor,
						`${formatMember(newState.member ?? oldState.member ?? null)} был перемещён между голосовыми каналами`
					).addFields(
						{ name: "Из канала", value: formatChannel(oldState.channel), inline: true },
						{ name: "В канал", value: formatChannel(newState.channel), inline: true },
					);

					await sendAuditEmbed(newState.guild, "voice", embed);
					return;
				}

				const embed = buildBaseEmbed(
					"Смена голосового канала",
					Colors.Blurple,
					null,
					`${formatMember(newState.member ?? oldState.member ?? null)} перешёл в другой голосовой канал`
				).addFields(
					{ name: "Из канала", value: formatChannel(oldState.channel), inline: true },
					{ name: "В канал", value: formatChannel(newState.channel), inline: true },
				);

				await sendAuditEmbed(newState.guild, "voice", embed);
				return;
			}

			if (!oldState.channelId && newState.channelId) {
				const embed = buildBaseEmbed(
					"Вход в голосовой канал",
					Colors.Green,
					null,
					`${formatMember(newState.member ?? null)} подключился к голосовому каналу`
				).addFields({
					name: "Канал",
					value: formatChannel(newState.channel),
					inline: true,
				});

				await sendAuditEmbed(newState.guild, "voice", embed);
				return;
			}

			if (oldState.channelId && !newState.channelId) {
				const embed = buildBaseEmbed(
					"Выход из голосового канала",
					Colors.Red,
					null,
					`${formatMember(oldState.member ?? null)} вышел из голосового канала`
				).addFields({
					name: "Канал",
					value: formatChannel(oldState.channel),
					inline: true,
				});

				await sendAuditEmbed(newState.guild, "voice", embed);
				return;
			}
		}
	});

	client.on("guildBanAdd", async (ban) => {
		if (!isFamilyGuild(ban.guild)) return;

		const entry = await findAuditEntry(
			ban.guild,
			AuditLogEvent.MemberBanAdd,
			(auditEntry) => auditEntry.target?.id === ban.user.id,
		);

		const embed = buildBaseEmbed(
			"Выдан бан",
			Colors.Red,
			entry?.executor ?? null,
			`${formatUser(ban.user)} был забанен`
		);

		await sendAuditEmbed(ban.guild, "moderation", embed);
	});

	client.on("guildBanRemove", async (ban) => {
		if (!isFamilyGuild(ban.guild)) return;

		const entry = await findAuditEntry(
			ban.guild,
			AuditLogEvent.MemberBanRemove,
			(auditEntry) => auditEntry.target?.id === ban.user.id,
		);

		const embed = buildBaseEmbed(
			"Снят бан",
			Colors.Green,
			entry?.executor ?? null,
			`С пользователя ${formatUser(ban.user)} снят бан`
		);

		await sendAuditEmbed(ban.guild, "moderation", embed);
	});

	client.on("messageDelete", async (message: any) => {
		try {
			if (!message.guild || !isFamilyGuild(message.guild)) return;

			// Пытаемся догрузить partial-сообщение, если можно
			if (message.partial) {
				try {
					await message.fetch();
				} catch {}
			}

			const snapshot = messageCache.get(message.id) ?? null;

			const author = message.author ?? null;
			const authorId = author?.id ?? snapshot?.authorId ?? null;

			// Если это бот — не логируем
			if (author?.bot) {
				messageCache.delete(message.id);
				return;
			}

			// Небольшая задержка, чтобы audit log успел обновиться
			await new Promise((resolve) => setTimeout(resolve, 1200));

			let entry: any = null;

			if (authorId) {
				entry = await findAuditEntry(
					message.guild,
					AuditLogEvent.MessageDelete,
					(auditEntry) =>
						auditEntry.target?.id === authorId &&
						auditEntry.extra?.channel?.id === message.channelId
				);
			}

			// Фолбэк: если по authorId не нашли, ищем просто по каналу
			if (!entry) {
				entry = await findAuditEntry(
					message.guild,
					AuditLogEvent.MessageDelete,
					(auditEntry) => auditEntry.extra?.channel?.id === message.channelId
				);
			}

			const attachments =
				message.attachments?.size
					? Array.from(message.attachments.values())
						.map((attachment: any) => attachment.url)
						.filter(Boolean)
					: snapshot?.attachments ?? [];

			const authorLabel =
				author
					? formatUser(author)
					: snapshot?.authorLabel ?? "Не удалось определить";

			const executor =
				entry?.executor && entry.executor.id !== authorId
					? entry.executor
					: null;

			const deletedByModerator = !!executor;

			const embed = buildBaseEmbed(
				"Удалено сообщение",
				Colors.Red,
				executor,
				deletedByModerator
					? `Модератор удалил сообщение в канале <#${message.channelId}>`
					: `Сообщение удалено в канале <#${message.channelId}>`
			).addFields(
				{ name: "Автор", value: authorLabel, inline: true },
				{ name: "Канал", value: `<#${message.channelId}>`, inline: true },
				{ name: "ID сообщения", value: `\`${message.id}\``, inline: true },
				{ name: "Содержимое", value: formatMessageContent(message, snapshot), inline: false },
			);

			if (attachments.length) {
				embed.addFields({
					name: "Вложения",
					value: truncateText(attachments.join("\n"), 1000),
					inline: false,
				});
			}

			await sendAuditEmbed(message.guild, "message-delete", embed);
			messageCache.delete(message.id);
		} catch (error) {
			console.error("[family-audit] messageDelete error:", error);
		}
	});

	client.on("messageDeleteBulk", async (messages) => {
		const firstMessage = messages.first();
		if (!firstMessage?.guild || !isFamilyGuild(firstMessage.guild)) return;

		const authors = new Set<string>();
		for (const message of messages.values()) {
			if (message.author?.bot) continue;
			const snapshot = messageCache.get(message.id);
			if (message.author?.id) authors.add(message.author.id);
			if (snapshot?.authorId) authors.add(snapshot.authorId);
			messageCache.delete(message.id);
		}

		const entry = await findAuditEntry(
			firstMessage.guild,
			AuditLogEvent.MessageBulkDelete,
			(auditEntry) => auditEntry.extra?.channel?.id === firstMessage.channelId,
		);

		const embed = buildBaseEmbed(
			"Массовое удаление сообщений",
			Colors.DarkRed,
			entry?.executor ?? null,
			`В канале <#${firstMessage.channelId}> было удалено **${messages.size}** сообщений`
		).addFields(
			{ name: "Канал", value: `<#${firstMessage.channelId}>`, inline: true },
			{ name: "Количество сообщений", value: `\`${messages.size}\``, inline: true },
			{ name: "Затронуто авторов", value: `\`${authors.size}\``, inline: true },
		);

		await sendAuditEmbed(firstMessage.guild, "message-delete", embed);
	});

	client.on("messageUpdate", async (oldMessage: any, newMessage: any) => {
		if (!newMessage.guild || !isFamilyGuild(newMessage.guild) || newMessage.author?.bot) return;

		const beforeSnapshot = messageCache.get(newMessage.id) ?? snapshotFromMessage(oldMessage);
		const before = oldMessage.content ?? beforeSnapshot?.content ?? "";
		const after = newMessage.content ?? "";
		if (before === after) return;

		const embed = buildBaseEmbed(
			"Изменено сообщение",
			Colors.Yellow,
			newMessage.author ?? null,
			`Сообщение изменено в канале <#${newMessage.channelId}>`
		).addFields(
			{ name: "Автор", value: formatUser(newMessage.author ?? oldMessage.author ?? null), inline: true },
			{ name: "Канал", value: `<#${newMessage.channelId}>`, inline: true },
			{ name: "ID сообщения", value: `\`${newMessage.id}\``, inline: true },
			{ name: "До", value: truncateText(before || "Текст недоступен.", 1000), inline: false },
			{ name: "После", value: truncateText(after || "Текст недоступен.", 1000), inline: false },
		);

		await sendAuditEmbed(newMessage.guild, "message-edit", embed);
	});
}
