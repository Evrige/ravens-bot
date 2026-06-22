import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	Colors,
	EmbedBuilder,
	TextChannel,
} from "discord.js";
import { Prisma } from "../generated/prisma/client";
import { config } from "../config/env";
import { CUSTOM_IDS } from "../constants/customIds";
import { prisma } from "../utils/prisma";
import { getWheelRewards, WheelVisualReward } from "../utils/renderDailyWheel";

const COOLDOWN_MS = 1_000;

export class DailyWheelCooldownError extends Error {
	constructor(public readonly nextSpinAt: Date) {
		super("Daily wheel is on cooldown");
	}
}

export type DailyWheelSpinResult = {
	spinId: bigint;
	reward: WheelVisualReward;
	visualRewards: WheelVisualReward[];
	nextSpinAt: Date;
	autoIssued: boolean;
};

function pickReward(rewards: WheelVisualReward[]) {
	const roll = Math.random() * 100;
	let cursor = 0;

	for (const reward of rewards) {
		cursor += reward.chance;
		if (roll < cursor) return reward;
	}

	return rewards[rewards.length - 1];
}

export async function getDailyWheelRewards() {
	return await prisma.dailyWheelReward.findMany({
		orderBy: { id: "asc" },
	});
}

export async function getDailyWheelCooldown(userId: string) {
	const cooldown = await prisma.dailyWheelCooldown.findUnique({
		where: { userId },
	});
	return cooldown?.nextSpinAt ?? null;
}

export async function spinDailyWheel(userId: string): Promise<DailyWheelSpinResult> {
	const storedRewards = await getDailyWheelRewards();
	if (!storedRewards.length) {
		throw new Error("DAILY_WHEEL_NO_REWARDS");
	}

	const totalChance = storedRewards.reduce((sum, reward) => sum + reward.chance, 0);
	if (totalChance > 100.000001) {
		throw new Error("DAILY_WHEEL_INVALID_CHANCES");
	}

	const visualRewards = getWheelRewards(storedRewards);
	const selected = pickReward(visualRewards);
	const now = new Date();
	const nextSpinAt = new Date(now.getTime() + COOLDOWN_MS);
	const autoIssued = selected.rewardType === "COINS" || selected.rewardType === "NONE";

	// В тестовом режиме сбрасываем только старые кулдауны от 24-часовой настройки.
	if (COOLDOWN_MS === 1_000) {
		await prisma.dailyWheelCooldown.updateMany({
			where: {
				userId,
				nextSpinAt: { gt: new Date(now.getTime() + 10_000) },
			},
			data: { nextSpinAt: now },
		});
	}

	const spin = await prisma.$transaction(async (tx) => {
		const claimed = await tx.$queryRaw<Array<{ nextSpinAt: Date }>>(Prisma.sql`
			INSERT INTO "DailyWheelCooldown" ("userId", "nextSpinAt", "updatedAt")
			VALUES (${userId}, ${nextSpinAt}, NOW())
			ON CONFLICT ("userId") DO UPDATE
			SET "nextSpinAt" = EXCLUDED."nextSpinAt", "updatedAt" = NOW()
			WHERE "DailyWheelCooldown"."nextSpinAt" <= ${now}
			RETURNING "nextSpinAt"
		`);

		if (!claimed.length) {
			const current = await tx.dailyWheelCooldown.findUnique({
				where: { userId },
			});
			throw new DailyWheelCooldownError(current?.nextSpinAt ?? nextSpinAt);
		}

		if (selected.rewardType === "COINS" && selected.amount && selected.amount > 0) {
			await tx.user.upsert({
				where: { id: userId },
				update: { balance: { increment: selected.amount } },
				create: { id: userId, balance: selected.amount },
			});
		}

		return await tx.dailyWheelSpin.create({
			data: {
				userId,
				rewardId: selected.id,
				rewardName: selected.name,
				rewardType: selected.rewardType,
				amount: selected.amount,
				fulfilled: autoIssued,
				fulfilledAt: autoIssued ? now : null,
			},
		});
	});

	return {
		spinId: spin.id,
		reward: selected,
		visualRewards,
		nextSpinAt,
		autoIssued,
	};
}

export async function sendDailyWheelLog(client: Client, result: DailyWheelSpinResult, userId: string) {
	if (!config.DAILY_WHEEL_LOG_CHANNEL_ID) return;

	const channel = await client.channels.fetch(config.DAILY_WHEEL_LOG_CHANNEL_ID).catch(() => null);
	if (!channel || !channel.isTextBased() || !("send" in channel)) return;

	const isManual = result.reward.rewardType === "MANUAL";
	const embed = new EmbedBuilder()
		.setColor(
			result.reward.rewardType === "NONE"
				? Colors.Grey
				: isManual
					? Colors.Orange
					: Colors.Green
		)
		.setTitle(isManual ? "🎁 Ручная награда колеса" : "🎡 Результат ежедневного колеса")
		.addFields(
			{ name: "Пользователь", value: `<@${userId}>`, inline: true },
			{ name: "Награда", value: result.reward.name, inline: true },
			{
				name: "Тип",
				value:
					result.reward.rewardType === "COINS"
						? `Монеты (${result.reward.amount ?? 0})`
						: result.reward.rewardType === "MANUAL"
							? "Ручная выдача"
							: "Без выигрыша",
				inline: true,
			},
			{ name: "Spin ID", value: `\`${result.spinId.toString()}\``, inline: true },
			{
				name: "Статус",
				value: isManual ? "⏳ Ожидает выдачи" : "✅ Выдано автоматически",
				inline: true,
			}
		)
		.setTimestamp();

	const components = isManual
		? [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`${CUSTOM_IDS.DAILY_WHEEL_FULFILL}${result.spinId.toString()}`)
					.setLabel("Отметить как выдано")
					.setStyle(ButtonStyle.Success)
			),
		]
		: [];

	await (channel as TextChannel).send({
		embeds: [embed],
		components,
		allowedMentions: { users: [userId] },
	}).catch(() => {});
}

export async function fulfillDailyWheelSpin(spinId: bigint, moderatorId: string) {
	return await prisma.dailyWheelSpin.updateMany({
		where: {
			id: spinId,
			rewardType: "MANUAL",
			fulfilled: false,
		},
		data: {
			fulfilled: true,
			fulfilledBy: moderatorId,
			fulfilledAt: new Date(),
		},
	});
}
