import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { FamilyGameRecord, getFamilyGames } from "../utils/familyGamesStore";

const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;
const BOT_MESSAGE_TYPE = "family_games_public_panel";

function truncateButtonLabel(name: string) {
	return name.length > 80 ? `${name.slice(0, 77)}...` : name;
}

function buildGamesPanel(games: FamilyGameRecord[]) {
	const container = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Получение ролей игр" },
			{
				type: V2.TextDisplay,
				content: [
					"Нажми на кнопку с названием игры, чтобы получить роль.",
					"После этого откроется доступ к каналам и войсам игры.",
					"Если передумал, нажми на ту же кнопку ещё раз и роль снимется.",
				].join("\n"),
			},
		] as any[],
	};

	if (!games.length) {
		container.components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "Пока что игровых ролей ещё нет." },
		);
		return [container];
	}

	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let index = 0; index < games.length; index += 5) {
		const slice = games.slice(index, index + 5);
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			...slice.map((game) =>
				new ButtonBuilder()
					.setCustomId(`${CUSTOM_IDS.FAMILY_GAMES_ROLE_TOGGLE}${game.id}`)
					.setLabel(truncateButtonLabel(game.name))
					.setStyle(ButtonStyle.Primary)
			)
		);
		rows.push(row);
	}

	return [container, ...rows];
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FAMILY_GAMES) {
		console.warn("[family-games] FAMILY_GAMES_CHANNEL_ID is not set");
		return null;
	}

	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_GAMES).catch((error) => {
		console.warn("[family-games] failed to fetch FAMILY_GAMES channel:", error);
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
			console.warn("family games panel delete failed:", error);
		}
	}
}

export async function upsertFamilyGamesPanel(client: Client, forceRepost = false) {
	const channel = await resolveTargetChannel(client);
	if (!channel) return;

	const games = await getFamilyGames();
	const components = buildGamesPanel(games);
	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components };
	const payloadEdit: any = { components };
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
				console.warn("family games panel edit failed, recreating:", error);
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
