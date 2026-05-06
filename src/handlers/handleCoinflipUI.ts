import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	Client,
	Colors,
	EmbedBuilder,
	Message,
	MessageFlags,
	User,
} from "discord.js";
import path from "path";
import { CUSTOM_IDS } from "../constants/customIds";
import { prisma } from "../utils/prisma";
import { decimalToNumber, formatCoins, formatDateTime } from "../utils/formatters";
import {
	CoinflipSide,
	PersistedCoinflipChallenge,
	listCoinflipChallenges,
	removeCoinflipChallenge,
	upsertCoinflipChallenge,
} from "../utils/coinflipStore";
import { sendFamilyAuditCustomEmbed } from "../services/startFamilyAuditLogger";

const coinflipChallenges = new Map<string, PersistedCoinflipChallenge>();
const coinflipTimers = new Map<string, NodeJS.Timeout>();
const LONDO_GIF_PATH = path.join(process.cwd(), "assets", "gif", "londo.gif");
const PHOENIX_GIF_PATH = path.join(process.cwd(), "assets", "gif", "phoenix.gif");
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
const ROLL_DURATION_MS = 6500;

function makeChallengeId() {
	return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clearChallengeTimer(challengeId: string) {
	const timer = coinflipTimers.get(challengeId);
	if (timer) {
		clearTimeout(timer);
		coinflipTimers.delete(challengeId);
	}
}

function buildPendingEmbed(challenge: PersistedCoinflipChallenge) {
	return new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle("Coinflip на монеты")
		.setDescription(
			challenge.targetUserId
				? `<@${challenge.creatorId}> вызывает <@${challenge.targetUserId}> на coinflip.`
				: `<@${challenge.creatorId}> ищет соперника для coinflip.`
		)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true },
			{
				name: "Режим",
				value: challenge.targetUserId ? "Личный вызов" : "Открытая игра",
				inline: true,
			},
			{
				name: "Статус",
				value: challenge.targetUserId
					? "Ожидаем решение соперника"
					: "Ожидаем игрока по кнопке ниже",
				inline: true,
			},
			{
				name: "Автоотмена",
				value: `<t:${Math.floor(challenge.expiresAt / 1000)}:R>`,
				inline: true,
			},
		)
		.setFooter({ text: `Creator: ${challenge.creatorTag}` })
		.setTimestamp(new Date(challenge.createdAt));
}

function buildRollingEmbed(challenge: PersistedCoinflipChallenge) {
	return new EmbedBuilder()
		.setColor(Colors.Gold)
		.setTitle("Coinflip начался")
		.setDescription(
			[
				`<@${challenge.creatorId}> vs <@${challenge.opponentId}>`,
				"",
				`**LONDO** — <@${challenge.londoUserId}>`,
				`**PHOENIX** — <@${challenge.phoenixUserId}>`,
				"",
				"Монета крутится...",
			].join("\n")
		)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true },
			{ name: "LONDO", value: `<@${challenge.londoUserId}>`, inline: true },
			{ name: "PHOENIX", value: `<@${challenge.phoenixUserId}>`, inline: true },
			{
				name: "Финиш",
				value: challenge.rollEndsAt
					? `<t:${Math.floor(challenge.rollEndsAt / 1000)}:R>`
					: "Скоро",
				inline: true,
			},
		)
		.setImage(
			`attachment://${challenge.winnerSide === "LONDO" ? "londo.gif" : "phoenix.gif"}`
		)
		.setTimestamp(new Date(challenge.rollStartedAt ?? Date.now()));
}

function buildResultEmbed(challenge: PersistedCoinflipChallenge) {
	return new EmbedBuilder()
		.setColor(Colors.Green)
		.setTitle("Coinflip завершён")
		.setDescription(
			[
				`Победитель: <@${challenge.winnerId}>`,
				`Выпала сторона **${challenge.winnerSide}**`,
			].join("\n")
		)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true },
			{ name: "LONDO", value: `<@${challenge.londoUserId}>`, inline: true },
			{ name: "PHOENIX", value: `<@${challenge.phoenixUserId}>`, inline: true },
		)
		.setTimestamp();
}

function buildDeclinedEmbed(challenge: PersistedCoinflipChallenge, declinedById: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle("Coinflip отклонён")
		.setDescription(
			`<@${declinedById}> отклонил вызов от <@${challenge.creatorId}>.`
		)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true },
		)
		.setTimestamp();
}

function buildCancelledEmbed(challenge: PersistedCoinflipChallenge, reasonText: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle("Coinflip отменён")
		.setDescription(reasonText)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Создан", value: formatDateTime(new Date(challenge.createdAt)), inline: true },
		)
		.setTimestamp();
}

function buildChallengeButtons(challengeId: string, targeted: boolean) {
	if (targeted) {
		return new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`${CUSTOM_IDS.COINFLIP_JOIN}${challengeId}`)
				.setLabel("Принять")
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`${CUSTOM_IDS.COINFLIP_DECLINE}${challengeId}`)
				.setLabel("Отказать")
				.setStyle(ButtonStyle.Danger)
		);
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.COINFLIP_JOIN}${challengeId}`)
			.setLabel("Играть")
			.setStyle(ButtonStyle.Primary)
	);
}

async function ensureUserBalance(userId: string) {
	return prisma.user.upsert({
		where: { id: userId },
		update: {},
		create: { id: userId, balance: 0 as any },
	});
}

async function logCoinflip(
	client: Client,
	title: string,
	description: string,
	color: number
) {
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(color)
		.setTimestamp();

	await sendFamilyAuditCustomEmbed(client, "balance", embed).catch(() => {});
}

async function getChallengeMessage(client: Client, challenge: PersistedCoinflipChallenge) {
	const channel = await client.channels.fetch(challenge.channelId).catch(() => null);
	if (!channel || !channel.isTextBased() || !("messages" in channel) || !challenge.messageId) return null;
	return channel.messages.fetch(challenge.messageId).catch(() => null);
}

async function finalizeCoinflip(client: Client, challenge: PersistedCoinflipChallenge) {
	if (!challenge.winnerId || !challenge.winnerSide) return;

	clearChallengeTimer(challenge.id);

	await prisma.user.update({
		where: { id: challenge.winnerId },
		data: { balance: { increment: (challenge.amount * 2) as any } },
	}).catch(() => {});

	challenge.status = "finished";

	const message = await getChallengeMessage(client, challenge);
	const gifPath = challenge.winnerSide === "LONDO" ? LONDO_GIF_PATH : PHOENIX_GIF_PATH;
	const gifName = challenge.winnerSide === "LONDO" ? "londo.gif" : "phoenix.gif";

	if (message) {
		await message.edit({
			embeds: [buildResultEmbed(challenge)],
			components: [],
			files: [new AttachmentBuilder(gifPath, { name: gifName })],
		}).catch(() => {});
	}

	await logCoinflip(
		client,
		"Coinflip завершён",
		[
			`Создатель: <@${challenge.creatorId}>`,
			`Соперник: <@${challenge.opponentId}>`,
			`Победитель: <@${challenge.winnerId}>`,
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Банк: ${formatCoins(challenge.amount * 2)} 🪙`,
			`Выпала сторона: **${challenge.winnerSide}**`,
		].join("\n"),
		Colors.Green
	);

	coinflipChallenges.delete(challenge.id);
	await removeCoinflipChallenge(challenge.id);
}

async function cancelCoinflip(
	client: Client,
	challenge: PersistedCoinflipChallenge,
	reasonText: string,
	logTitle = "Coinflip отменён"
) {
	clearChallengeTimer(challenge.id);
	challenge.status = "cancelled";

	const message = await getChallengeMessage(client, challenge);
	if (message) {
		await message.edit({
			embeds: [buildCancelledEmbed(challenge, reasonText)],
			components: [],
		}).catch(() => {});
	}

	await logCoinflip(
		client,
		logTitle,
		[
			`Создатель: <@${challenge.creatorId}>`,
			challenge.opponentId ? `Соперник: <@${challenge.opponentId}>` : "Соперник: не найден",
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			reasonText,
		].join("\n"),
		Colors.Red
	);

	coinflipChallenges.delete(challenge.id);
	await removeCoinflipChallenge(challenge.id);
}

function schedulePendingExpiry(client: Client, challenge: PersistedCoinflipChallenge) {
	clearChallengeTimer(challenge.id);
	const delay = Math.max(0, challenge.expiresAt - Date.now());

	coinflipTimers.set(
		challenge.id,
		setTimeout(() => {
			cancelCoinflip(
				client,
				challenge,
				"Вызов автоматически отменён, потому что никто не принял игру за 5 минут.",
				"Coinflip истёк"
			).catch(() => {});
		}, delay)
	);
}

function scheduleRollFinish(client: Client, challenge: PersistedCoinflipChallenge) {
	clearChallengeTimer(challenge.id);
	const delay = Math.max(0, (challenge.rollEndsAt ?? Date.now()) - Date.now());

	coinflipTimers.set(
		challenge.id,
		setTimeout(() => {
			finalizeCoinflip(client, challenge).catch(() => {});
		}, delay)
	);
}

async function startCoinflip(client: Client, message: Message, challenge: PersistedCoinflipChallenge, opponent: User) {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const creator = await tx.user.upsert({
			where: { id: challenge.creatorId },
			update: {},
			create: { id: challenge.creatorId, balance: 0 as any },
		});
		const joiner = await tx.user.upsert({
			where: { id: opponent.id },
			update: {},
			create: { id: opponent.id, balance: 0 as any },
		});

		const creatorBalance = decimalToNumber(creator.balance);
		const joinerBalance = decimalToNumber(joiner.balance);

		if (creatorBalance < challenge.amount) return { ok: false as const, reason: "creator_balance" as const };
		if (joinerBalance < challenge.amount) return { ok: false as const, reason: "joiner_balance" as const };

		await tx.user.update({
			where: { id: challenge.creatorId },
			data: { balance: { decrement: challenge.amount as any } },
		});
		await tx.user.update({
			where: { id: opponent.id },
			data: { balance: { decrement: challenge.amount as any } },
		});

		return { ok: true as const };
	});

	if (!transactionResult.ok) {
		const reasonText =
			transactionResult.reason === "creator_balance"
				? "Игра отменена: у создателя к моменту старта не хватило монет."
				: "Игра отменена: у второго игрока к моменту старта не хватило монет.";
		await cancelCoinflip(client, challenge, reasonText);
		return transactionResult.reason;
	}

	const creatorSide: CoinflipSide = Math.random() < 0.5 ? "LONDO" : "PHOENIX";
	const opponentSide: CoinflipSide = creatorSide === "LONDO" ? "PHOENIX" : "LONDO";
	const winnerSide: CoinflipSide = Math.random() < 0.5 ? "LONDO" : "PHOENIX";
	const londoUserId = creatorSide === "LONDO" ? challenge.creatorId : opponent.id;
	const phoenixUserId = opponentSide === "PHOENIX" ? opponent.id : challenge.creatorId;
	const winnerId = winnerSide === "LONDO" ? londoUserId : phoenixUserId;
	const gifPath = winnerSide === "LONDO" ? LONDO_GIF_PATH : PHOENIX_GIF_PATH;
	const gifName = winnerSide === "LONDO" ? "londo.gif" : "phoenix.gif";

	challenge.status = "rolling";
	challenge.opponentId = opponent.id;
	challenge.creatorSide = creatorSide;
	challenge.opponentSide = opponentSide;
	challenge.winnerSide = winnerSide;
	challenge.londoUserId = londoUserId;
	challenge.phoenixUserId = phoenixUserId;
	challenge.winnerId = winnerId;
	challenge.rollStartedAt = Date.now();
	challenge.rollEndsAt = challenge.rollStartedAt + ROLL_DURATION_MS;

	await upsertCoinflipChallenge(challenge);

	await message.edit({
		embeds: [buildRollingEmbed(challenge)],
		components: [],
		files: [new AttachmentBuilder(gifPath, { name: gifName })],
	}).catch(() => {});

	await logCoinflip(
		client,
		"Coinflip начался",
		[
			`Создатель: <@${challenge.creatorId}>`,
			`Соперник: <@${opponent.id}>`,
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Банк: ${formatCoins(challenge.amount * 2)} 🪙`,
			`LONDO: <@${londoUserId}>`,
			`PHOENIX: <@${phoenixUserId}>`,
		].join("\n"),
		Colors.Gold
	);

	scheduleRollFinish(client, challenge);
	return "ok";
}

export async function createCoinflipChallenge(
	interaction: ChatInputCommandInteraction,
	amount: number,
	targetUser: User | null
) {
	const creator = await ensureUserBalance(interaction.user.id);
	if (decimalToNumber(creator.balance) < amount) {
		await interaction.reply({
			content: `❌ Недостаточно монет. Для игры нужно ${formatCoins(amount)} 🪙.`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return;
	}

	const challengeId = makeChallengeId();
	const challenge: PersistedCoinflipChallenge = {
		id: challengeId,
		channelId: interaction.channelId,
		messageId: null,
		creatorId: interaction.user.id,
		creatorTag: interaction.user.tag,
		targetUserId: targetUser?.id ?? null,
		opponentId: null,
		amount,
		status: "pending",
		createdAt: Date.now(),
		expiresAt: Date.now() + PENDING_TIMEOUT_MS,
		rollStartedAt: null,
		rollEndsAt: null,
		creatorSide: null,
		opponentSide: null,
		winnerSide: null,
		londoUserId: null,
		phoenixUserId: null,
		winnerId: null,
	};

	coinflipChallenges.set(challengeId, challenge);

	await interaction.reply({
		embeds: [buildPendingEmbed(challenge)],
		components: [buildChallengeButtons(challengeId, !!targetUser)],
	});

	const reply = await interaction.fetchReply().catch(() => null);
	if (reply) {
		challenge.messageId = reply.id;
	}

	await upsertCoinflipChallenge(challenge);
	schedulePendingExpiry(interaction.client, challenge);

	await logCoinflip(
		interaction.client,
		"Создан coinflip",
		[
			`Создатель: <@${challenge.creatorId}>`,
			targetUser ? `Вызов: <@${targetUser.id}>` : "Режим: открытая игра",
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Автоотмена: <t:${Math.floor(challenge.expiresAt / 1000)}:R>`,
		].join("\n"),
		Colors.Blurple
	);
}

export async function restoreCoinflipChallenges(client: Client) {
	const persisted = await listCoinflipChallenges();

	for (const challenge of persisted) {
		if (challenge.status === "pending") {
			coinflipChallenges.set(challenge.id, challenge);
			if (challenge.expiresAt <= Date.now()) {
				await cancelCoinflip(
					client,
					challenge,
					"Вызов автоматически отменён после перезапуска бота, потому что время ожидания уже истекло.",
					"Coinflip истёк"
				);
				continue;
			}
			schedulePendingExpiry(client, challenge);
			continue;
		}

		if (challenge.status === "rolling") {
			coinflipChallenges.set(challenge.id, challenge);
			if ((challenge.rollEndsAt ?? 0) <= Date.now()) {
				await finalizeCoinflip(client, challenge);
				continue;
			}
			scheduleRollFinish(client, challenge);
		}
	}
}

export async function handleCoinflipUI(interaction: ButtonInteraction) {
	const isJoin = interaction.customId.startsWith(CUSTOM_IDS.COINFLIP_JOIN);
	const isDecline = interaction.customId.startsWith(CUSTOM_IDS.COINFLIP_DECLINE);
	if (!isJoin && !isDecline) return false;

	const challengeId = interaction.customId.replace(
		isJoin ? CUSTOM_IDS.COINFLIP_JOIN : CUSTOM_IDS.COINFLIP_DECLINE,
		""
	);
	const challenge = coinflipChallenges.get(challengeId);

	if (!challenge || challenge.status !== "pending") {
		await interaction.reply({
			content: "ℹ️ Эта игра уже недоступна.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (interaction.user.id === challenge.creatorId) {
		await interaction.reply({
			content: "❌ Нельзя принять или отклонить свой же вызов.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (challenge.targetUserId && interaction.user.id !== challenge.targetUserId) {
		await interaction.reply({
			content: "❌ Этот вызов адресован другому игроку.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	if (isDecline) {
		clearChallengeTimer(challenge.id);
		challenge.status = "declined";
		await interaction.update({
			embeds: [buildDeclinedEmbed(challenge, interaction.user.id)],
			components: [],
		}).catch(() => {});
		await logCoinflip(
			interaction.client,
			"Coinflip отклонён",
			[
				`Создатель: <@${challenge.creatorId}>`,
				`Отклонил: <@${interaction.user.id}>`,
				`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			].join("\n"),
			Colors.Red
		);
		coinflipChallenges.delete(challenge.id);
		await removeCoinflipChallenge(challenge.id);
		return true;
	}

	const opponent = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
	if (!opponent) {
		await interaction.reply({
			content: "❌ Не удалось определить второго игрока.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	const secondPlayer = await ensureUserBalance(opponent.id);
	if (decimalToNumber(secondPlayer.balance) < challenge.amount) {
		await interaction.reply({
			content: `❌ Недостаточно монет. Для игры нужно ${formatCoins(challenge.amount)} 🪙.`,
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return true;
	}

	await interaction.deferUpdate().catch(() => {});
	await startCoinflip(interaction.client, interaction.message, challenge, opponent);
	return true;
}
