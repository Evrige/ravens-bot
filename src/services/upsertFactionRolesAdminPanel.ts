import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";
import { FactionRoleRecord, getFactionRoles } from "../utils/factionRolesStore";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;
const BOT_MESSAGE_TYPE = "faction_roles_admin_panel";
const MAX_ROLES_IN_ADMIN_PANEL = 4;

function buildAdminPanel(records: FactionRoleRecord[]) {
	const components: any[] = [
		{ type: V2.TextDisplay, content: "## Управление ролями фракций" },
		{ type: V2.TextDisplay, content: "Создай, переименуй или удали роль фракции." },
		{ type: V2.Separator },
		{
			type: V2.Section,
			components: [{ type: V2.TextDisplay, content: "Создать новую роль фракции." }],
			accessory: {
				type: V2.Button,
				style: ButtonStyle.Success,
				label: "Создать роль",
				custom_id: CUSTOM_IDS.FACTION_ROLES_PANEL_CREATE,
			},
		},
	];

	if (!records.length) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: "### Фракции\nПока что ролей нет." },
		);
		return { type: V2.Container, components };
	}

	components.push({ type: V2.Separator }, { type: V2.TextDisplay, content: "### Фракции" });

	const visibleRecords = records.slice(0, MAX_ROLES_IN_ADMIN_PANEL);
	for (const record of visibleRecords) {
		components.push(
			{
				type: V2.Section,
				components: [{
					type: V2.TextDisplay,
					content: [`**${record.name}**`, `Роль: <@&${record.roleId}>`].join("\n"),
				}],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Primary,
					label: "Редактировать",
					custom_id: `${CUSTOM_IDS.FACTION_ROLES_PANEL_EDIT}${record.id}`,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Удалить роль фракции." }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Danger,
					label: "Удалить",
					custom_id: `${CUSTOM_IDS.FACTION_ROLES_PANEL_DELETE}${record.id}`,
				},
			},
		);
	}

	if (records.length > visibleRecords.length) {
		components.push(
			{ type: V2.Separator },
			{ type: V2.TextDisplay, content: `Показано ${visibleRecords.length} из ${records.length} ролей.` },
		);
	}

	return { type: V2.Container, components };
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FACTION_ROLES_PANEL) {
		console.warn("[faction-roles-admin] FACTION_ROLES_PANEL_CHANNEL_ID is not set");
		return null;
	}

	const channel = await client.channels.fetch(CHANNEL_IDS.FACTION_ROLES_PANEL).catch((error) => {
		console.warn("[faction-roles-admin] failed to fetch FACTION_ROLES_PANEL channel:", error);
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
			console.warn("faction roles admin panel delete failed:", error);
		}
	}
}

export async function upsertFactionRolesAdminPanel(client: Client, forceRepost = false) {
	const channel = await resolveTargetChannel(client);
	if (!channel) return;

	const records = await getFactionRoles();
	const container = buildAdminPanel(records);
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
				console.warn("faction roles admin panel edit failed, recreating:", error);
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
