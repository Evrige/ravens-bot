import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { CHANNEL_IDS } from "../config/channels";
import { CUSTOM_IDS } from "../constants/customIds";

const V2 = { Container: 17, Section: 9, TextDisplay: 10, Separator: 14, Button: 2 } as const;
const BOT_MESSAGE_TYPE = "family_giveaway_panel";

function buildGiveawayPanelMessage() {
	return {
		type: V2.Container,
		components: [
			{ type: V2.TextDisplay, content: "## Управление розыгрышами" },
			{
				type: V2.TextDisplay,
				content: [
					"Кнопки ниже:",
					"• **Создать розыгрыш** — откроет форму из 5 полей: приз, картинка, условия, количество победителей, время окончания.",
					"• **Реролл** — выбрать завершённый розыгрыш и переиграть победителей.",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: [
					"Сообщение розыгрыша отправляется в выбранный канал с упоминанием **@everyone**.",
					"",
					"**Форматы времени окончания:**",
					"• `HH:MM DD.MM.YYYY`",
					"• `HH:MM DD.MM` — текущий год, если дата прошла — следующий",
					"• `HH:MM` — сегодня, если время прошло — завтра",
					"• относительные: `10m`, `2h`, `3d`",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Создать новый розыгрыш" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Success,
					label: "Создать розыгрыш",
					custom_id: CUSTOM_IDS.GIVEAWAY_PANEL_CREATE,
				},
			},
			{
				type: V2.Section,
				components: [{ type: V2.TextDisplay, content: "Переиграть победителей завершённого розыгрыша" }],
				accessory: {
					type: V2.Button,
					style: ButtonStyle.Secondary,
					label: "Реролл",
					custom_id: CUSTOM_IDS.GIVEAWAY_PANEL_REROLL,
				},
			},
		],
	};
}

async function resolveTargetChannel(client: Client) {
	if (!CHANNEL_IDS.FAMILY_GIVEAWAY_PANEL) {
		console.warn("[giveaway-panel] FAMILY_GIVEAWAY_PANEL_CHANNEL_ID is not set");
		return null;
	}

	const channel = await client.channels.fetch(CHANNEL_IDS.FAMILY_GIVEAWAY_PANEL).catch((error) => {
		console.warn("[giveaway-panel] failed to fetch FAMILY_GIVEAWAY_PANEL channel:", error);
		return null;
	});
	if (!channel || !channel.isTextBased()) return null;
	return channel as TextChannel;
}

async function safeDeleteMessage(channel: TextChannel, messageId: string) {
	try {
		const msg = await channel.messages.fetch(messageId);
		await msg.delete().catch(() => {});
	} catch (err: any) {
		if (err?.code !== 10008) console.warn("giveaway panel delete failed:", err);
	}
}

export async function upsertGiveawayPanel(client: Client, forceRepost = false) {
	const channel = await resolveTargetChannel(client);
	if (!channel) return;

	const container = buildGiveawayPanelMessage();
	const payloadSend: any = { flags: MessageFlags.IsComponentsV2, components: [container] };
	const payloadEdit: any = { components: [container] };
	const botMsg = await prisma.botMessage.findUnique({ where: { type: BOT_MESSAGE_TYPE } });

	if (forceRepost) {
		if (botMsg && botMsg.channelId === channel.id) {
			await safeDeleteMessage(channel, botMsg.messageId);
		}

		const newMsg = await channel.send(payloadSend);
		await prisma.botMessage.upsert({
			where: { type: BOT_MESSAGE_TYPE },
			update: { messageId: newMsg.id, channelId: channel.id },
			create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: channel.id },
		});
		return;
	}

	if (botMsg && botMsg.channelId === channel.id) {
		try {
			const msg = await channel.messages.fetch(botMsg.messageId);
			await msg.edit(payloadEdit);
			return;
		} catch (err: any) {
			if (err?.code !== 10008) {
				console.warn("giveaway panel edit failed, recreating:", err);
			}
		}
	}

	const newMsg = await channel.send(payloadSend);
	await prisma.botMessage.upsert({
		where: { type: BOT_MESSAGE_TYPE },
		update: { messageId: newMsg.id, channelId: channel.id },
		create: { type: BOT_MESSAGE_TYPE, messageId: newMsg.id, channelId: channel.id },
	});
}
