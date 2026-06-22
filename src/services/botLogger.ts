import {
	Client,
	EmbedBuilder,
	TextBasedChannel,
} from "discord.js";
import { config } from "../config/env";

type BotLogLevel = "info" | "success" | "warn" | "error";

type BotLogPayload = {
	level: BotLogLevel;
	title: string;
	description?: string;
	error?: unknown;
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

const COLORS: Record<BotLogLevel, number> = {
	info: 0x5865f2,
	success: 0x2ecc71,
	warn: 0xf1c40f,
	error: 0xe74c3c,
};

const ICONS: Record<BotLogLevel, string> = {
	info: "ℹ️",
	success: "✅",
	warn: "⚠️",
	error: "❌",
};

const MAX_QUEUE_SIZE = 25;
const MAX_DESCRIPTION = 3500;
const MAX_FIELD_VALUE = 1000;

let clientRef: Client | null = null;
let isSending = false;
let consoleBridgeInstalled = false;
let queue: BotLogPayload[] = [];

function trimText(value: string, max = MAX_DESCRIPTION) {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 20)}\n... [обрезано]`;
}

function stringifyPart(value: unknown) {
	if (value instanceof Error) {
		return value.stack || value.message || String(value);
	}

	if (typeof value === "string") return value;

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function formatError(error: unknown) {
	if (!error) return null;
	return trimText(stringifyPart(error));
}

async function resolveLogChannel(client: Client): Promise<TextBasedChannel | null> {
	const channelId = config.BOT_LOG_CHANNEL_ID;
	if (!channelId) return null;

	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel || !channel.isTextBased()) return null;
	if (!("send" in channel)) return null;

	return channel;
}

function buildEmbed(payload: BotLogPayload) {
	const embed = new EmbedBuilder()
		.setColor(COLORS[payload.level])
		.setTitle(`${ICONS[payload.level]} ${payload.title}`)
		.setTimestamp()
		.setFooter({ text: "Londo Bot logs" });

	if (payload.description) {
		embed.setDescription(trimText(payload.description));
	}

	const fields = [...(payload.fields ?? [])];
	const formattedError = formatError(payload.error);

	if (formattedError) {
		fields.push({
			name: "Ошибка",
			value: `\`\`\`\n${trimText(formattedError, MAX_FIELD_VALUE)}\n\`\`\``,
			inline: false,
		});
	}

	if (fields.length) {
		embed.addFields(
			fields.slice(0, 10).map((field) => ({
				name: trimText(field.name, 256),
				value: trimText(field.value || "-", MAX_FIELD_VALUE),
				inline: field.inline ?? false,
			})),
		);
	}

	return embed;
}

async function sendNow(payload: BotLogPayload) {
	if (!clientRef || isSending) {
		queue.push(payload);
		queue = queue.slice(-MAX_QUEUE_SIZE);
		return;
	}

	isSending = true;
	try {
		const channel = await resolveLogChannel(clientRef);
		if (!channel) return;

		await (channel as any).send({ embeds: [buildEmbed(payload)] }).catch(() => {});
	} finally {
		isSending = false;
	}
}

export function initBotLogger(client: Client) {
	clientRef = client;
	void flushBotLogQueue();
}

export async function flushBotLogQueue() {
	if (!clientRef || !queue.length) return;

	const pending = queue;
	queue = [];

	for (const payload of pending) {
		await sendNow(payload);
	}
}

export function logBotEvent(payload: BotLogPayload) {
	void sendNow(payload);
}

export function installBotConsoleBridge() {
	if (consoleBridgeInstalled) return;
	consoleBridgeInstalled = true;

	const originalError = console.error.bind(console);
	const originalWarn = console.warn.bind(console);

	console.error = (...args: unknown[]) => {
		originalError(...args);
		if (isSending) return;

		logBotEvent({
			level: "error",
			title: "Console error",
			description: trimText(args.map(stringifyPart).join("\n")),
		});
	};

	console.warn = (...args: unknown[]) => {
		originalWarn(...args);
		if (isSending) return;

		logBotEvent({
			level: "warn",
			title: "Console warning",
			description: trimText(args.map(stringifyPart).join("\n")),
		});
	};
}
