import { Client, Colors, EmbedBuilder } from "discord.js";
import { config } from "../config/env";
import { formatDateTime } from "../utils/formatters";
import {
	FamilyVacationRecord,
	getActiveVacationRecord,
	getFamilyVacations,
	mutateFamilyVacations,
} from "../utils/familyVacationStore";
import { getFamilyVacationLogsThread } from "./upsertFamilyVacationPanel";

async function logVacationAction(client: Client, options: {
	title: string;
	color: number;
	userId: string;
	reason: string;
	endAt?: Date | string | null;
}) {
	const thread = await getFamilyVacationLogsThread(client);
	if (!thread) return;

	const embed = new EmbedBuilder()
		.setTitle(options.title)
		.setColor(options.color)
		.addFields(
			{ name: "Участник", value: `<@${options.userId}>`, inline: true },
			{ name: "Причина", value: options.reason, inline: false },
		)
		.setTimestamp();

	if (options.endAt) {
		embed.addFields({
			name: "До",
			value: formatDateTime(options.endAt),
			inline: true,
		});
	}

	await thread.send({ embeds: [embed] }).catch(() => {});
}

async function updateVacationRole(client: Client, userId: string, shouldHaveRole: boolean) {
	if (!config.FAMILY_VACATION_ID) return;

	const guild = await client.guilds.fetch(config.FAMILY_SERVER_GUID).catch(() => null);
	if (!guild) return;

	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member) return;

	if (shouldHaveRole) {
		if (!member.roles.cache.has(config.FAMILY_VACATION_ID)) {
			await member.roles.add(config.FAMILY_VACATION_ID).catch(() => {});
		}
		return;
	}

	if (member.roles.cache.has(config.FAMILY_VACATION_ID)) {
		await member.roles.remove(config.FAMILY_VACATION_ID).catch(() => {});
	}
}

export async function startVacation(client: Client, input: {
	userId: string;
	username: string;
	reason: string;
	endAt: Date;
}) {
	const existing = await getActiveVacationRecord(input.userId);
	if (existing) {
		return { ok: false as const, reason: "already_active", record: existing };
	}

	const now = new Date().toISOString();
	const record: FamilyVacationRecord = {
		id: `vac_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
		userId: input.userId,
		username: input.username,
		reason: input.reason,
		startedAt: now,
		endAt: input.endAt.toISOString(),
		status: "ACTIVE",
		closedAt: null,
	};

	await mutateFamilyVacations((records) => {
		records.push(record);
	});
	await updateVacationRole(client, input.userId, true);
	await logVacationAction(
		client,
		{
			title: "Отпуск начат",
			color: Colors.Blurple,
			userId: input.userId,
			reason: record.reason,
			endAt: record.endAt,
		}
	);

	return { ok: true as const, record };
}

export async function endVacation(client: Client, userId: string) {
	let finished: FamilyVacationRecord | null = null;

	await mutateFamilyVacations((records) => {
		const current = records.find((entry) => entry.userId === userId && entry.status === "ACTIVE");
		if (!current) return;

		current.status = "ENDED";
		current.closedAt = new Date().toISOString();
		finished = { ...current };
	});

	if (finished === null) return null;
	const finishedRecord: FamilyVacationRecord = finished;

	await updateVacationRole(client, userId, false);
	await logVacationAction(
		client,
		{
			title: "Отпуск завершён вручную",
			color: Colors.Green,
			userId,
			reason: finishedRecord.reason,
		}
	);
	return finishedRecord;
}

export async function expireVacations(client: Client) {
	const expired: FamilyVacationRecord[] = [];
	const now = Date.now();

	await mutateFamilyVacations((records) => {
		for (const record of records) {
			if (record.status !== "ACTIVE") continue;
			if (new Date(record.endAt).getTime() > now) continue;

			record.status = "EXPIRED";
			record.closedAt = new Date().toISOString();
			expired.push({ ...record });
		}
	});

	for (const record of expired) {
		await updateVacationRole(client, record.userId, false);
		await logVacationAction(
			client,
			{
				title: "Отпуск завершён автоматически",
				color: Colors.Orange,
				userId: record.userId,
				reason: record.reason,
				endAt: record.endAt,
			}
		);
	}

	return expired;
}

export async function buildVacationListText() {
	const records = await getFamilyVacations();
	const active = records.filter((entry) => entry.status === "ACTIVE");

	if (!active.length) {
		return "Сейчас никто не находится в отпуске.";
	}

	return active
		.map(
			(entry, index) =>
				`${index + 1}. <@${entry.userId}> — до **${formatDateTime(entry.endAt)}**\nПричина: ${entry.reason}`
		)
		.join("\n\n");
}

export { getActiveVacationRecord };
