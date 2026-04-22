import { Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { DAILY_EVENT_SCHEDULE, DailyEventSchedule } from "../config/eventsSchedule";
import { CHANNEL_IDS } from "../config/channels";

const V2 = {
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

const BOT_MSG_TYPE = "family_events_panel";
const UTC_PLUS_THREE_OFFSET_HOURS = 3;
function getUtcPlusThreeDate(base = new Date()) {
	return new Date(base.getTime() + UTC_PLUS_THREE_OFFSET_HOURS * 60 * 60 * 1000);
}

function pad2(value: number) {
	return String(value).padStart(2, "0");
}

function formatTime(hour: number, minute: number) {
	return `${pad2(hour)}:${pad2(minute)}`;
}

function getEventEndMinutes(event: DailyEventSchedule) {
	if (typeof event.endHour === "number" && typeof event.endMinute === "number") {
		return event.endHour * 60 + event.endMinute;
	}

	return event.hour * 60 + event.minute + 60;
}

function formatEventRange(event: DailyEventSchedule) {
	return `${formatTime(event.hour, event.minute)}-${formatTime(
		Math.floor(getEventEndMinutes(event) / 60),
		getEventEndMinutes(event) % 60
	)}`;
}

function formatNow(now: Date) {
	return `${pad2(now.getUTCDate())}.${pad2(now.getUTCMonth() + 1)}.${now.getUTCFullYear()} ${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
}

function formatDays(daysOfWeek: number[]) {
	if (daysOfWeek.length === 7) {
		return "Каждый день";
	}

	const dayMap = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
	return daysOfWeek.map((day) => dayMap[day] ?? "?").join(", ");
}

function isEventActive(event: DailyEventSchedule, nowUtcPlusThree: Date) {
	const currentDay = nowUtcPlusThree.getUTCDay();
	if (!event.daysOfWeek.includes(currentDay)) {
		return false;
	}

	const nowMinutes = nowUtcPlusThree.getUTCHours() * 60 + nowUtcPlusThree.getUTCMinutes();
	const eventMinutes = event.hour * 60 + event.minute;
	const eventEndMinutes = getEventEndMinutes(event);

	return nowMinutes >= eventMinutes && nowMinutes < eventEndMinutes;
}

function buildEventLine(event: DailyEventSchedule, nowUtcPlusThree: Date) {
	const active = isEventActive(event, nowUtcPlusThree);
	const status = active ? "🟢" : "🔴";
	const title = active ? "**АКТИВЕН**" : "**НЕ АКТИВЕН**";

	return `${status} ${formatEventRange(event)} — ${event.name} ${title}\n-# ${formatDays(event.daysOfWeek)}`;
}

function buildPanel(nowUtcPlusThree: Date) {
	const activeEvents = DAILY_EVENT_SCHEDULE.filter((event) => isEventActive(event, nowUtcPlusThree));
	const sortedEvents = [...DAILY_EVENT_SCHEDULE].sort((a, b) => {
		const timeA = a.hour * 60 + a.minute;
		const timeB = b.hour * 60 + b.minute;
		if (timeA !== timeB) return timeA - timeB;
		return a.name.localeCompare(b.name, "ru");
	});

	const activeBlock =
		activeEvents.length > 0
			? activeEvents.map((event) => `🟢 ${formatEventRange(event)} — **${event.name}**`).join("\n")
			: "🔴 Сейчас активных ивентов нет";

	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Ивенты семьи" },
			{ type: V2.TextDisplay, content: `Обновлено: **${formatNow(nowUtcPlusThree)}** (UTC+3)` },
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Что активно сейчас" },
			{ type: V2.TextDisplay, content: activeBlock },
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Полное расписание" },
			{ type: V2.TextDisplay, content: sortedEvents.map((event) => buildEventLine(event, nowUtcPlusThree)).join("\n\n") },
		],
	};
}

async function safeDeleteMessage(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) {
			console.warn("family events panel delete failed:", err);
		}
	}
}

export async function updateFamilyEventsPanel(client: Client, channel?: TextChannel, forceRepost = false) {
	if (!channel) {
		const fetched = await client.channels.fetch(CHANNEL_IDS.FAMILY_EVENTS).catch(() => null);
		if (!fetched || !fetched.isTextBased()) return;
		channel = fetched as TextChannel;
	}

	const container = buildPanel(getUtcPlusThreeDate());
	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [container],
	};
	const payloadEdit: any = {
		components: [container],
	};

	const botMsg = await prisma.botMessage.findUnique({
		where: { type: BOT_MSG_TYPE },
	});

	if (forceRepost) {
		if (botMsg && botMsg.channelId === channel.id) {
			await safeDeleteMessage(channel, botMsg.messageId);
		}

		const newMsg = await channel.send(payloadSend);

		if (botMsg) {
			await prisma.botMessage.update({
				where: { type: BOT_MSG_TYPE },
				data: { messageId: newMsg.id, channelId: channel.id },
			});
		} else {
			await prisma.botMessage.create({
				data: { type: BOT_MSG_TYPE, messageId: newMsg.id, channelId: channel.id },
			});
		}
		return;
	}

	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			if (err?.code !== 10008) {
				console.warn("family events panel edit failed, recreating:", err);
			}
		}
	}

	const newMsg = await channel.send(payloadSend);

	if (botMsg) {
		await prisma.botMessage.update({
			where: { type: BOT_MSG_TYPE },
			data: { messageId: newMsg.id, channelId: channel.id },
		});
	} else {
		await prisma.botMessage.create({
			data: { type: BOT_MSG_TYPE, messageId: newMsg.id, channelId: channel.id },
		});
	}
}
