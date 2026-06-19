import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { config } from "../config/env";
import { CUSTOM_IDS } from "../constants/customIds";
import { prisma } from "../utils/prisma";

const BOT_MESSAGE_TYPE = "streamer_admin_panel";
const V2 = {
	ActionRow: 1,
	Button: 2,
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

function chunkLines(lines: string[], maxLength = 3000) {
	const chunks: string[] = [];
	let current = "";

	for (const line of lines) {
		const next = current ? `${current}\n${line}` : line;
		if (next.length > maxLength && current) {
			chunks.push(current);
			current = line;
		} else {
			current = next;
		}
	}

	if (current) chunks.push(current);
	return chunks;
}

async function buildStreamerPanel() {
	const streamers = await prisma.streamer.findMany({
		where: config.FAMILY_SERVER_GUID
			? { guildId: config.FAMILY_SERVER_GUID }
			: undefined,
		orderBy: { id: "asc" },
	});

	const components: any[] = [
		{
			type: V2.TextDisplay,
			content: "## 🎥 Управление стримерами\nДобавление, редактирование и удаление Twitch-каналов.",
		},
		{ type: V2.Separator },
	];

	if (!streamers.length) {
		components.push({
			type: V2.TextDisplay,
			content: "### ID | Пользователь | Канал\nСписок стримеров пока пуст.",
		});
	} else {
		const lines = streamers.map(
			(streamer) =>
				`**${streamer.id}** | <@${streamer.discordUserId}> | [${streamer.twitchLogin}](${streamer.twitchUrl})`
		);

		const chunks = chunkLines(lines);
		components.push({
			type: V2.TextDisplay,
			content: `### ID | Пользователь | Канал\n${chunks[0]}`,
		});

		for (const chunk of chunks.slice(1)) {
			components.push({
				type: V2.TextDisplay,
				content: chunk,
			});
		}
	}

	components.push(
		{ type: V2.Separator },
		{
			type: V2.ActionRow,
			components: [
				{
					type: V2.Button,
					style: ButtonStyle.Success,
					label: "Добавить",
					custom_id: CUSTOM_IDS.STREAMER_PANEL_ADD,
				},
				{
					type: V2.Button,
					style: ButtonStyle.Primary,
					label: "Редактировать",
					custom_id: CUSTOM_IDS.STREAMER_PANEL_EDIT,
				},
				{
					type: V2.Button,
					style: ButtonStyle.Danger,
					label: "Удалить",
					custom_id: CUSTOM_IDS.STREAMER_PANEL_DELETE,
				},
			],
		}
	);

	return {
		type: V2.Container,
		accent_color: 0x9146ff,
		components,
	};
}

export async function upsertStreamerPanel(client: Client) {
	if (!config.STREAMER_PANEL_CHANNEL_ID) {
		console.warn("[streamer-panel] STREAMER_PANEL_CHANNEL_ID is not set");
		return { ok: false, reason: "channel_not_set" as const };
	}

	const channel = await client.channels.fetch(config.STREAMER_PANEL_CHANNEL_ID).catch(() => null);
	if (!channel || !channel.isTextBased() || !("send" in channel)) {
		console.warn("[streamer-panel] panel channel not found or is not text based");
		return { ok: false, reason: "channel_not_found" as const };
	}

	const textChannel = channel as TextChannel;
	const container = await buildStreamerPanel();
	const stored = await prisma.botMessage.findUnique({
		where: { type: BOT_MESSAGE_TYPE },
	});

	if (stored?.channelId === textChannel.id) {
		const message = await textChannel.messages.fetch(stored.messageId).catch(() => null);
		if (message) {
			await message.edit({
				components: [container],
				allowedMentions: { parse: [] },
			} as any);
			return { ok: true, mode: "edited" as const };
		}
	}

	const message = await textChannel.send({
		flags: MessageFlags.IsComponentsV2,
		components: [container],
		allowedMentions: { parse: [] },
	} as any);

	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { channelId: textChannel.id, messageId: message.id },
		create: {
			type: BOT_MESSAGE_TYPE,
			channelId: textChannel.id,
			messageId: message.id,
		},
	});

	return { ok: true, mode: "created" as const };
}
