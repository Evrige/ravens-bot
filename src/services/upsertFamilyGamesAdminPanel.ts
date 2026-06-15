import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { FamilyGameRecord, getFamilyGames } from "../utils/familyGamesStore";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;
const BOT_MESSAGE_TYPE = "family_games_admin_panel";
const MAX_GAMES_IN_ADMIN_PANEL = 4;

function buildAdminPanel(games: FamilyGameRecord[]) {
	const components: any[] = [
		{ type: V2.TextDisplay, content: "## Управление игровыми ролями" },
		{
			type: V2.TextDisplay,
			content: [
				"Кнопки ниже:",
				"• **Создать игру** — создаёт роль игры и 3 канала: 1 чат + 2 войса.",
				"• **Редактировать** — переименует игру, роль и связанные каналы.",
				"• **Удалить** — удалит игру из панели, роль и все связанные каналы.",
			].join("\n"),
		},
		{ type: V2.Separator },
		{
			type: V2.Section,
			components: [{ type: V2.TextDisplay, content: "Создать новую игровую роль и набор каналов." }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				label: "Создать игру",
				custom_id: CUSTOM_IDS.FAMILY_GAMES_PANEL_CREATE,
			},
		},
	];

	if (!games.length) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Игры\nПока что игр нет." },
		);
		return { type: V2.Container, components };
	}

	components.push({ type: V2.Separator }, { type: V2.TextDisplay, content: "### Игры" });

	const visibleGames = games.slice(0, MAX_GAMES_IN_ADMIN_PANEL);

	for (const game of visibleGames) {
		const voiceMentions = game.voiceChannelIds.map((id) => `<#${id}>`).join(" • ");

		components.push(
			{
				type: V2.Section,
				components: [{
					type: V2.TextDisplay,
					content: [
						`**${game.name}**`,
						`Роль: <@&${game.roleId}>`,
						`Чат: <#${game.textChannelId}>`,
						`Войсы: ${voiceMentions || "ещё не созданы"}`,
					].join("\n"),
				}],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Primary,
					label: "Редактировать",
					custom_id: `${CUSTOM_IDS.FAMILY_GAMES_PANEL_EDIT}${game.id}`,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Удалить игру вместе с ролью и каналами." }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Danger,
					label: "Удалить",
					custom_id: `${CUSTOM_IDS.FAMILY_GAMES_PANEL_DELETE}${game.id}`,
				},
			},
		);

	}

	if (games.length > visibleGames.length) {
		components.push(
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `Показано ${visibleGames.length} из ${games.length} игр. Удали или переименуй остальные через файл данных/каналы, чтобы они снова появились в этой панели.`,
			},
		);
	}

	return { type: V2.Container, components };
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FAMILY_GAMES_PANEL) {
		console.warn("[family-games-admin] FAMILY_GAMES_PANEL_CHANNEL_ID is not set");
		return null;
	}

	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_GAMES_PANEL).catch((error) => {
		console.warn("[family-games-admin] failed to fetch FAMILY_GAMES_PANEL channel:", error);
		return null;
	});
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

async function safeDeleteMessage(channel: TextChannel, messageId: string) {
	try {
		const message = await channel.messages.fetch(messageId);
		await message.delete().catch(() => {});
	} catch (error: any) {
		if (error?.code !== 10008) {
			console.warn("family games admin panel delete failed:", error);
		}
	}
}

export async function upsertFamilyGamesAdminPanel(client: Client, forceRepost = false) {
	const channel = await resolveTargetChannel(client);
	if (!channel) return;

	const games = await getFamilyGames();
	const container = buildAdminPanel(games);
	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components: [container] };
	const payloadEdit: any = { components: [container] };
	const stored = await prisma.botMessage.findUnique({ where: { type: BOT_MESSAGE_TYPE } });

	if (forceRepost) {
		if (stored && stored.channelId === channel.id) {
			await safeDeleteMessage(channel, stored.messageId);
		}

		const newMessage = await channel.send(payloadSend);
		await prisma.botMessage.upsert({
			where: { type: BOT_MESSAGE_TYPE },
			update: { messageId: newMessage.id, channelId: channel.id },
			create: { type: BOT_MESSAGE_TYPE, messageId: newMessage.id, channelId: channel.id },
		});
		return;
	}

	if (stored && stored.channelId === channel.id) {
		try {
			const message = await channel.messages.fetch(stored.messageId);
			await message.edit(payloadEdit);
			return;
		} catch (error: any) {
			if (error?.code !== 10008) {
				console.warn("family games admin panel edit failed, recreating:", error);
			}
		}
	}

	const newMessage = await channel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { messageId: newMessage.id, channelId: channel.id },
		create: { type: BOT_MESSAGE_TYPE, messageId: newMessage.id, channelId: channel.id },
	});
}
