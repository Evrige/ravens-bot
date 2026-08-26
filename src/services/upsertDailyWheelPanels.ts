import { ButtonStyle, Client, MessageFlags, TextChannel } from "discord.js";
import { config } from "../config/env";
import { CUSTOM_IDS } from "../constants/customIds";
import { prisma } from "../utils/prisma";
import { getDailyWheelSettings } from "./dailyWheelService";

const USER_PANEL_TYPE = "daily_wheel_user_panel";
const ADMIN_PANEL_TYPE = "daily_wheel_admin_panel";
const V2 = {
	ActionRow: 1,
	Button: 2,
	Container: 17,
	TextDisplay: 10,
	Separator: 14,
} as const;

async function buildUserPanel() {
	const settings = await getDailyWheelSettings();
	return {
		type: V2.Container,
		accent_color: 0xa855f7,
		components: [
			{
				type: V2.TextDisplay,
				content: [
					"## 🎡 Ежедневное колесо Londo",
					"Испытай удачу и получи случайную награду.",
					"",
					"Колесо доступно **раз в 24 часа** с момента предыдущего вращения.",
					`Дополнительное вращение доступно за **${settings.paidSpinPrice.toLocaleString("ru-RU")} монет** без ожидания.`,
					"Монеты начисляются автоматически. Остальные призы выдаются администрацией.",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.ActionRow,
				components: [
					{
						type: V2.Button,
						style: ButtonStyle.Primary,
						label: "Бесплатное вращение",
						emoji: { name: "🎡" },
						custom_id: CUSTOM_IDS.DAILY_WHEEL_SPIN,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Success,
						label: `За ${settings.paidSpinPrice.toLocaleString("ru-RU")} монет`,
						emoji: { name: "🪙" },
						custom_id: CUSTOM_IDS.DAILY_WHEEL_PAID_SPIN,
					},
				],
			},
		],
	};
}

async function buildAdminPanel() {
	const settings = await getDailyWheelSettings();
	const rewards = await prisma.dailyWheelReward.findMany({
		orderBy: { id: "asc" },
	});
	const totalChance = rewards.reduce((sum, reward) => sum + reward.chance, 0);

	const lines = rewards.map((reward) => {
		const type =
			reward.rewardType === "COINS"
				? `🪙 Авто: ${reward.amount?.toLocaleString("ru-RU") ?? 0}`
				: "🎁 Вручную";
		const image = reward.imageUrl ? " — 🖼️" : "";
		return `**${reward.id}.** ${reward.name} — **${reward.chance}%** — ${type}${image}`;
	});

	return {
		type: V2.Container,
		accent_color: totalChance > 100 ? 0xed4245 : 0x9146ff,
		components: [
			{
				type: V2.TextDisplay,
				content: [
					"## ⚙️ Управление ежедневным колесом",
					"Добавляй награды, указывай шанс и способ выдачи.",
					"",
					`**Сумма шансов:** ${totalChance.toFixed(2).replace(/\.?0+$/, "")}%`,
					`**Цена платного вращения:** ${settings.paidSpinPrice.toLocaleString("ru-RU")} монет`,
					totalChance < 100
						? `**Без выигрыша:** ${(100 - totalChance).toFixed(2).replace(/\.?0+$/, "")}%`
						: totalChance === 100
							? "Все 100% распределены."
							: "⚠️ Сумма больше 100%. Вращение заблокировано.",
				].join("\n"),
			},
			{ type: V2.Separator },
			{
				type: V2.TextDisplay,
				content: lines.length
					? `### ID | Награда | Шанс | Выдача\n${lines.join("\n").slice(0, 3500)}`
					: "### Награды\nПока наград нет.",
			},
			{ type: V2.Separator },
			{
				type: V2.ActionRow,
				components: [
					{
						type: V2.Button,
						style: ButtonStyle.Success,
						label: "Добавить награду",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_ADD,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Primary,
						label: "Редактировать",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_EDIT,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: "Картинка",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_IMAGE,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: "Цена вращения",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_PRICE,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Danger,
						label: "Удалить награду",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_DELETE,
					},
				],
			},
			{
				type: V2.ActionRow,
				components: [
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: "Сбросить таймер",
						custom_id: CUSTOM_IDS.DAILY_WHEEL_ADMIN_RESET_COOLDOWN,
					},
					{
						type: V2.Button,
						style: ButtonStyle.Secondary,
						label: "Статистика наград",
						emoji: { name: "📊" },
						custom_id: CUSTOM_IDS.DAILY_WHEEL_STATS,
					},
				],
			},
		],
	};
}

async function upsertPanel(
	client: Client,
	channelId: string,
	messageType: string,
	container: any
) {
	if (!channelId) return { ok: false, reason: "channel_not_set" as const };

	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel || !channel.isTextBased() || !("send" in channel)) {
		return { ok: false, reason: "channel_not_found" as const };
	}

	const textChannel = channel as TextChannel;
	const stored = await prisma.botMessage.findUnique({ where: { type: messageType } });

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
		where: { type: messageType },
		update: { channelId: textChannel.id, messageId: message.id },
		create: { type: messageType, channelId: textChannel.id, messageId: message.id },
	});

	return { ok: true, mode: "created" as const };
}

export async function upsertDailyWheelUserPanel(client: Client) {
	return await upsertPanel(
		client,
		config.DAILY_WHEEL_CHANNEL_ID,
		USER_PANEL_TYPE,
		await buildUserPanel()
	);
}

export async function upsertDailyWheelAdminPanel(client: Client) {
	return await upsertPanel(
		client,
		config.DAILY_WHEEL_ADMIN_CHANNEL_ID,
		ADMIN_PANEL_TYPE,
		await buildAdminPanel()
	);
}

export async function upsertDailyWheelPanels(client: Client) {
	await upsertDailyWheelUserPanel(client);
	await upsertDailyWheelAdminPanel(client);
}
