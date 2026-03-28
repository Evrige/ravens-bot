import { Client, TextChannel } from "discord.js";
import { DAILY_EVENT_SCHEDULE } from "../config/eventsSchedule";
import { CHANNEL_IDS } from "../config/channels";

const REMIND_BEFORE_MINUTES = 5;
const UTC_PLUS_THREE_OFFSET_HOURS = 3;
const sentReminderKeys = new Set<string>();

function getUtcPlusThreeDate(base = new Date()) {
	return new Date(base.getTime() + UTC_PLUS_THREE_OFFSET_HOURS * 60 * 60 * 1000);
}

function buildReminderKey(nowUtcPlusThree: Date, eventName: string, hour: number, minute: number) {
	const year = nowUtcPlusThree.getUTCFullYear();
	const month = String(nowUtcPlusThree.getUTCMonth() + 1).padStart(2, "0");
	const day = String(nowUtcPlusThree.getUTCDate()).padStart(2, "0");

	return `${year}-${month}-${day}:${hour}:${minute}:${eventName}`;
}

async function sendEventReminders(client: Client) {
	const nowUtcPlusThree = getUtcPlusThreeDate();
	const currentDay = nowUtcPlusThree.getUTCDay();
	const currentHour = nowUtcPlusThree.getUTCHours();
	const currentMinute = nowUtcPlusThree.getUTCMinutes();

	const channel = await client.channels.fetch(CHANNEL_IDS.EVENTS_NOTIFY).catch(() => null);
	if (!channel?.isTextBased()) {
		return;
	}

	for (const event of DAILY_EVENT_SCHEDULE) {
		if (!event.daysOfWeek.includes(currentDay)) {
			continue;
		}

		const eventTotalMinutes = event.hour * 60 + event.minute;
		const reminderTotalMinutes = eventTotalMinutes - REMIND_BEFORE_MINUTES;
		const reminderHour = Math.floor(reminderTotalMinutes / 60);
		const reminderMinute = reminderTotalMinutes % 60;

		if (currentHour !== reminderHour || currentMinute !== reminderMinute) {
			continue;
		}

		const reminderKey = buildReminderKey(
			nowUtcPlusThree,
			event.name,
			event.hour,
			event.minute
		);

		if (sentReminderKeys.has(reminderKey)) {
			continue;
		}

		await (channel as TextChannel).send(`Через ${REMIND_BEFORE_MINUTES} минут ${event.name}`);
		sentReminderKeys.add(reminderKey);
	}

	// Keep only today's keys so the in-memory dedupe set does not grow forever.
	const todayPrefix = buildReminderKey(nowUtcPlusThree, "", 0, 0).split(":")[0];
	for (const key of Array.from(sentReminderKeys)) {
		if (!key.startsWith(todayPrefix)) {
			sentReminderKeys.delete(key);
		}
	}
}

export function startEventNotifications(client: Client) {
	sendEventReminders(client).catch(console.error);
	setInterval(() => {
		sendEventReminders(client).catch(console.error);
	}, 60_000);
}
