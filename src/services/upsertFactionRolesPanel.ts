import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { FactionRoleRecord, getFactionRoles } from "../utils/factionRolesStore";

const V2 = { Container: 17, TextDisplay: 10, Separator: 14 } as const;
const BOT_MESSAGE_TYPE = "faction_roles_public_panel";
const MAX_ROLES_IN_PUBLIC_PANEL = 25;

function truncateButtonLabel(name: string) {
	return name.length > 80 ? `${name.slice(0, 77)}...` : name;
}

function buildFactionRolesPanel(records: FactionRoleRecord[]) {
	const container = {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Выдача ролей фракции" },
			{
				type: V2.TextDisplay,
				content: "Нажми на кнопку с названием фракции, чтобы получить или снять роль.",
			},
		] as any[],
	};

	if (!records.length) {
		container.components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "Пока что ролей фракций нет." },
		);
		return [container];
	}

	const visibleRecords = records.slice(0, MAX_ROLES_IN_PUBLIC_PANEL);
	if (records.length > visibleRecords.length) {
		container.components.push(
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: `Показано ${visibleRecords.length} из ${records.length} ролей. Остальные временно скрыты, чтобы панель не превышала лимит Discord.`,
			},
		);
	}

	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let index = 0; index < visibleRecords.length; index += 5) {
		const slice = visibleRecords.slice(index, index + 5);
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				...slice.map((record) =>
					new ButtonBuilder()
						.setCustomId(`${CUSTOM_IDS.FACTION_ROLES_TOGGLE}${record.id}`)
						.setLabel(truncateButtonLabel(record.name))
						.setStyle(ButtonStyle.Primary)
				)
			)
		);
	}

	return [container, ...rows];
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FACTION_ROLES) {
		console.warn("[faction-roles] FACTION_ROLES_CHANNEL_ID is not set");
		return null;
	}

	const channel = await client.channels.fetch(CHANNEL_IDS.FACTION_ROLES).catch((error) => {
		console.warn("[faction-roles] failed to fetch FACTION_ROLES channel:", error);
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
			console.warn("faction roles panel delete failed:", error);
		}
	}
}

export async function upsertFactionRolesPanel(client: Client, forceRepost = false) {
	const channel = await resolveTargetChannel(client);
	if (!channel) return;

	const records = await getFactionRoles();
	const components = buildFactionRolesPanel(records);
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
				console.warn("faction roles panel edit failed, recreating:", error);
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
