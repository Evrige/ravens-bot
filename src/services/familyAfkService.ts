import { Client } from "discord.js";
import { config } from "../config/env";
import {
	createAfkRecord,
	endActiveAfkRecord,
	expireDueAfkRecords,
	getActiveAfkRecord,
	getLatestAfkRecord,
	listActiveAfkRecords,
} from "./familyHistoryStore";
import { getFamilyAfkLogsThread } from "./upsertFamilyAfkPanel";
import { formatDateTime } from "../utils/formatters";

async function logAfkAction(client: Client, message: string) {
	const thread = await getFamilyAfkLogsThread(client);
	if (!thread) return;

	await thread.send(message).catch(() => {});
}

async function updateAfkRole(client: Client, userId: string, shouldHaveRole: boolean) {
	if (!config.FAMILY_AFK_ROLE_ID) return;

	const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
	if (!guild) return;

	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member) return;

	if (shouldHaveRole) {
		if (!member.roles.cache.has(config.FAMILY_AFK_ROLE_ID)) {
			await member.roles.add(config.FAMILY_AFK_ROLE_ID).catch(() => {});
		}
		return;
	}

	if (member.roles.cache.has(config.FAMILY_AFK_ROLE_ID)) {
		await member.roles.remove(config.FAMILY_AFK_ROLE_ID).catch(() => {});
	}
}

export async function startAfk(client: Client, input: {
	userId: string;
	username: string;
	reason: string;
	hours: number;
}) {
	const existing = await getActiveAfkRecord(input.userId);
	if (existing) return { ok: false as const, reason: "already_active", record: existing };

	const startedAt = new Date();
	const endAt = new Date(startedAt.getTime() + input.hours * 60 * 60 * 1000);
	const record = await createAfkRecord({
		userId: input.userId,
		reason: input.reason,
		startedAt,
		endAt,
	});
	if (!record) {
		return {
			ok: false as const,
			reason: "history_unavailable",
			record: { endAt, reason: input.reason },
		};
	}

	await updateAfkRole(client, input.userId, true);
	await logAfkAction(
		client,
		`🛌 AFK начат: <@${input.userId}> | До: ${formatDateTime(record.endAt)} | Причина: ${record.reason}`
	);

	return { ok: true as const, record };
}

export async function endAfk(client: Client, userId: string) {
	const record = await endActiveAfkRecord(userId, "ENDED");
	if (!record) return null;

	await updateAfkRole(client, userId, false);
	await logAfkAction(
		client,
		`✅ AFK завершён вручную: <@${userId}> | Причина: ${record.reason}`
	);

	return record;
}

export async function expireAfk(client: Client) {
	const expired = await expireDueAfkRecords();
	for (const record of expired) {
		await updateAfkRole(client, record.userId, false);
		await logAfkAction(
			client,
			`⏰ AFK завершён автоматически: <@${record.userId}> | Причина: ${record.reason} | До: ${formatDateTime(record.endAt)}`
		);
	}

	return expired;
}

export async function buildAfkListText() {
	const records = await listActiveAfkRecords();
	if (!records.length) {
		return "Сейчас никто не находится в AFK.";
	}

	return records
		.map(
			(entry, index) =>
				`${index + 1}. <@${entry.userId}> — до **${formatDateTime(entry.endAt)}**\nПричина: ${entry.reason}`
		)
		.join("\n\n");
}

export { getActiveAfkRecord, getLatestAfkRecord };
