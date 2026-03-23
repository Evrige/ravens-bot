import { Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { OrgType } from "../generated/prisma/enums";
import {getColorEmoji, getColorName} from "../utils/detectives/orgColors";

const V2 = {
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

const BOT_MSG_TYPE_FAMILY = "organisations_family_panel";
const BOT_MSG_TYPE_FRACTION = "organisations_fraction_panel";

type OrgRow = {
	id: bigint;
	name: string;
	subject: string | null;
	adress: string | null;
	color: string;
	type: OrgType;
	isFreeze: boolean;
	channelId: string | null;
};

function chunkArray<T>(arr: T[], size = 6) {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}

function buildOrgCard(org: OrgRow, index: number) {
	const emoji = getColorEmoji(org.color);
	const colorName = getColorName(org.color);
	const freezeText = org.isFreeze ? "\n> ❄️ Заморожена" : "";

	return [
		`### ${index}. ${emoji} ${org.name}`,
		`> **Прикрытие:** ${org.subject?.trim() || "Не указано"}`,
		`> **Адресс:** ${org.adress?.trim() || "Не указан"}`,
		`> **Цвет:** ${colorName}${freezeText}`,
	].join("\n");
}

function buildPanel(title: string, orgs: OrgRow[]) {
	const components: any[] = [
		{
			type: V2.TextDisplay,
			content: `# ${title}`,
		},
		{
			type: V2.TextDisplay,
			content: `### Всего: ${orgs.length}`,
		},
		{ type: V2.Separator },
	];

	if (!orgs.length) {
		components.push({
			type: V2.TextDisplay,
			content: "> Нет данных.",
		});

		return {
			type: V2.Container,
			components,
		};
	}

	const cards = orgs.map((org, index) => buildOrgCard(org, index + 1));
	const groups = chunkArray(cards, 5);

	for (let g = 0; g < groups.length; g++) {
		const group = groups[g];

		for (let i = 0; i < group.length; i++) {
			components.push({
				type: V2.TextDisplay,
				content: group[i],
			});

			if (i !== group.length - 1) {
				components.push({ type: V2.Separator });
			}
		}

		if (g !== groups.length - 1) {
			components.push({ type: V2.Separator });
		}
	}

	return {
		type: V2.Container,
		components,
	};
}

async function safeDelete(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) {
			console.warn("organisationsPanel delete failed:", err);
		}
	}
}

async function upsertPanelMessage(
	channel: TextChannel,
	botMsgType: string,
	container: any,
	forceRepost: boolean
) {
	const payloadSend: any = {
		flags: MessageFlags.IsComponentsV2,
		components: [container],
	};

	const payloadEdit: any = {
		components: [container],
	};

	const botMsg = await prisma.botMessage.findUnique({
		where: { type: botMsgType },
	});

	if (forceRepost) {
		if (botMsg && botMsg.channelId === channel.id) {
			await safeDelete(channel, botMsg.messageId);
		}

		const newMsg = await channel.send(payloadSend);

		if (botMsg) {
			await prisma.botMessage.update({
				where: { type: botMsgType },
				data: {
					messageId: newMsg.id,
					channelId: channel.id,
				},
			});
		} else {
			await prisma.botMessage.create({
				data: {
					type: botMsgType,
					messageId: newMsg.id,
					channelId: channel.id,
				},
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
				console.warn(`organisationsPanel edit failed (${botMsgType}), recreating:`, err);
			}
		}
	}

	const newMsg = await channel.send(payloadSend);

	if (botMsg) {
		await prisma.botMessage.update({
			where: { type: botMsgType },
			data: {
				messageId: newMsg.id,
				channelId: channel.id,
			},
		});
	} else {
		await prisma.botMessage.create({
			data: {
				type: botMsgType,
				messageId: newMsg.id,
				channelId: channel.id,
			},
		});
	}
}

export async function updateOrganisationsPanel(
	client: Client,
	channel?: TextChannel,
	forceRepost = false
) {
	if (!channel) {
		const familyBotMsg = await prisma.botMessage.findUnique({
			where: { type: BOT_MSG_TYPE_FAMILY },
		});

		const fractionBotMsg = await prisma.botMessage.findUnique({
			where: { type: BOT_MSG_TYPE_FRACTION },
		});

		const channelId = familyBotMsg?.channelId || fractionBotMsg?.channelId;
		if (!channelId) return;

		const ch = await client.channels.fetch(channelId).catch(() => null);
		if (!ch || !ch.isTextBased()) return;

		channel = ch as TextChannel;
	}

	const organisations = await prisma.organisation.findMany({
		orderBy: [{ isFreeze: "asc" }, { name: "asc" }],
	});

	const families = organisations.filter(
		(o) => o.type === OrgType.FAMILY && !o.isFreeze
	);

	const fractions = organisations.filter(
		(o) => o.type === OrgType.FRACTION && !o.isFreeze
	);

	const familyContainer = buildPanel("Семьи", families);
	const fractionContainer = buildPanel("Организации", fractions);

	await upsertPanelMessage(channel, BOT_MSG_TYPE_FAMILY, familyContainer, forceRepost);
	await upsertPanelMessage(channel, BOT_MSG_TYPE_FRACTION, fractionContainer, forceRepost);
}