import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	Client,
	Message,
	MessageFlags,
	User,
} from "discord.js";
import { existsSync } from "fs";
import path from "path";
import { CUSTOM_IDS } from "../constants/customIds";
import { sendFamilyAuditCustomEmbed } from "../services/startFamilyAuditLogger";
import { decimalToNumber, formatCoins, formatDateTime } from "../utils/formatters";
import {
	listDiceChallenges,
	PersistedDiceChallenge,
	removeDiceChallenge,
	upsertDiceChallenge,
} from "../utils/diceStore";
import { prisma } from "../utils/prisma";
import { AttachmentBuilder, EmbedBuilder, Colors } from "discord.js";
import {getDiceEmoji} from "../constants/getDiceEmoji";
const diceChallenges = new Map<string, PersistedDiceChallenge>();
const diceTimers = new Map<string, NodeJS.Timeout>();
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
const ROLL_DURATION_MS = 5000;

function makeChallengeId() {
	return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDiceImagePath(roll: number) {
	const imagePath = path.join(process.cwd(), "assets", "dice", `dice_${roll}.png`);
	return existsSync(imagePath) ? imagePath : null;
}

function clearChallengeTimer(challengeId: string) {
	const timer = diceTimers.get(challengeId);
	if (timer) {
		clearTimeout(timer);
		diceTimers.delete(challengeId);
	}
}

function buildPendingEmbed(challenge: PersistedDiceChallenge) {
	return new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle("Кости на монеты")
		.setDescription(
			challenge.targetUserId
				? `<@${challenge.creatorId}> вызывает <@${challenge.targetUserId}> сыграть в кости.`
				: `<@${challenge.creatorId}> ищет соперника для игры в кости.`
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
			}
		)
		.setFooter({ text: `Creator: ${challenge.creatorTag}` })
		.setTimestamp(new Date(challenge.createdAt));
}

function buildRollingEmbed(challenge: PersistedDiceChallenge) {
	return new EmbedBuilder()
		.setColor(Colors.Gold)
		.setTitle("Игра в кости началась")
		.setDescription(
			[
				`<@${challenge.creatorId}> vs <@${challenge.opponentId}>`,
				"",
				"Кости брошены...",
			].join("\n")
		)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true },
			{
				name: "Финиш",
				value: challenge.rollEndsAt
					? `<t:${Math.floor(challenge.rollEndsAt / 1000)}:R>`
					: "Скоро",
				inline: true,
			}
		)
		.setTimestamp(new Date(challenge.rollStartedAt ?? Date.now()));
}

function buildResultEmbeds(challenge: PersistedDiceChallenge) {
	const p1Dice = getDiceEmoji(challenge.creatorRoll!);
	const p2Dice = getDiceEmoji(challenge.opponentRoll!);

	return [
		new EmbedBuilder()
			.setColor(Colors.Green)
			.setTitle("🎲 Кости завершены")
			.setDescription(
				[
					`**Результат:** Победил <@${challenge.winnerId}> 🏆`,
					"",
					"**Броски игроков**",
					`<@${challenge.creatorId}> — ${p1Dice}`,
					`<@${challenge.opponentId}> — ${p2Dice}`,
					"",
					`**Значения:** ${challenge.creatorRoll} — ${challenge.opponentRoll}`,
					"",
					`💰 Банк: ${formatCoins(challenge.amount * 2)} 🪙`,
				].join("\n")
			)
			.setTimestamp()
	];
}

function buildResultFiles(challenge: PersistedDiceChallenge) {
	const files: AttachmentBuilder[] = [];
	const creatorPath = challenge.creatorRoll ? getDiceImagePath(challenge.creatorRoll) : null;
	const opponentPath = challenge.opponentRoll ? getDiceImagePath(challenge.opponentRoll) : null;

	if (creatorPath && challenge.creatorRoll) {
		files.push(
			new AttachmentBuilder(creatorPath, {
				name: `creator_dice_${challenge.creatorRoll}.png`,
			})
		);
	}

	if (opponentPath && challenge.opponentRoll) {
		files.push(
			new AttachmentBuilder(opponentPath, {
				name: `opponent_dice_${challenge.opponentRoll}.png`,
			})
		);
	}

	return files;
}

function buildDeclinedEmbed(challenge: PersistedDiceChallenge, declinedById: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle("Игра в кости отклонена")
		.setDescription(`<@${declinedById}> отклонил вызов от <@${challenge.creatorId}>.`)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Банк", value: `${formatCoins(challenge.amount * 2)} 🪙`, inline: true }
		)
		.setTimestamp();
}

function buildCancelledEmbed(challenge: PersistedDiceChallenge, reasonText: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle("Игра в кости отменена")
		.setDescription(reasonText)
		.addFields(
			{ name: "Ставка", value: `${formatCoins(challenge.amount)} 🪙`, inline: true },
			{ name: "Создан", value: formatDateTime(new Date(challenge.createdAt)), inline: true }
		)
		.setTimestamp();
}

function buildChallengeButtons(challengeId: string, targeted: boolean) {
	if (targeted) {
		return new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`${CUSTOM_IDS.DICE_JOIN}${challengeId}`)
				.setLabel("Принять")
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`${CUSTOM_IDS.DICE_DECLINE}${challengeId}`)
				.setLabel("Отказать")
				.setStyle(ButtonStyle.Danger)
		);
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CUSTOM_IDS.DICE_JOIN}${challengeId}`)
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

async function logDice(client: Client, title: string, description: string, color: number) {
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(color)
		.setTimestamp();

	await sendFamilyAuditCustomEmbed(client, "balance", embed).catch(() => {});
}

async function getChallengeMessage(client: Client, challenge: PersistedDiceChallenge) {
	const channel = await client.channels.fetch(challenge.channelId).catch(() => null);
	if (!channel || !channel.isTextBased() || !("messages" in channel) || !challenge.messageId) return null;
	return channel.messages.fetch(challenge.messageId).catch(() => null);
}

async function finalizeDice(client: Client, challenge: PersistedDiceChallenge) {
	if (!challenge.winnerId) return;

	clearChallengeTimer(challenge.id);

	await prisma.user.update({
		where: { id: challenge.winnerId },
		data: { balance: { increment: (challenge.amount * 2) as any } },
	}).catch(() => {});

	challenge.status = "finished";

	const message = await getChallengeMessage(client, challenge);
	if (message) {
		await message.edit({
			embeds: buildResultEmbeds(challenge),
			components: [],
		}).catch(() => {});
	}

	await logDice(
		client,
		"Кости завершены",
		[
			`Создатель: <@${challenge.creatorId}>`,
			`Соперник: <@${challenge.opponentId}>`,
			`Победитель: <@${challenge.winnerId}>`,
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Банк: ${formatCoins(challenge.amount * 2)} 🪙`,
			`<@${challenge.creatorId}>: **${challenge.creatorRoll}**`,
			`<@${challenge.opponentId}>: **${challenge.opponentRoll}**`,
		].join("\n"),
		Colors.Green
	);

	diceChallenges.delete(challenge.id);
	await removeDiceChallenge(challenge.id);
}

async function cancelDice(
	client: Client,
	challenge: PersistedDiceChallenge,
	reasonText: string,
	logTitle = "Игра в кости отменена"
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

	await logDice(
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

	diceChallenges.delete(challenge.id);
	await removeDiceChallenge(challenge.id);
}

function schedulePendingExpiry(client: Client, challenge: PersistedDiceChallenge) {
	clearChallengeTimer(challenge.id);
	const delay = Math.max(0, challenge.expiresAt - Date.now());

	diceTimers.set(
		challenge.id,
		setTimeout(() => {
			cancelDice(
				client,
				challenge,
				"Вызов автоматически отменён, потому что никто не принял игру за 5 минут.",
				"Кости истекли"
			).catch(() => {});
		}, delay)
	);
}

function scheduleRollFinish(client: Client, challenge: PersistedDiceChallenge) {
	clearChallengeTimer(challenge.id);
	const delay = Math.max(0, (challenge.rollEndsAt ?? Date.now()) - Date.now());

	diceTimers.set(
		challenge.id,
		setTimeout(() => {
			finalizeDice(client, challenge).catch(() => {});
		}, delay)
	);
}

async function startDice(client: Client, message: Message, challenge: PersistedDiceChallenge, opponent: User) {
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
		await cancelDice(client, challenge, reasonText);
		return transactionResult.reason;
	}

	let creatorRoll = Math.floor(Math.random() * 6) + 1;
	let opponentRoll = Math.floor(Math.random() * 6) + 1;
	while (creatorRoll === opponentRoll) {
		creatorRoll = Math.floor(Math.random() * 6) + 1;
		opponentRoll = Math.floor(Math.random() * 6) + 1;
	}

	challenge.status = "rolling";
	challenge.opponentId = opponent.id;
	challenge.creatorRoll = creatorRoll;
	challenge.opponentRoll = opponentRoll;
	challenge.winnerId = creatorRoll > opponentRoll ? challenge.creatorId : opponent.id;
	challenge.rollStartedAt = Date.now();
	challenge.rollEndsAt = challenge.rollStartedAt + ROLL_DURATION_MS;

	await upsertDiceChallenge(challenge);

	await message.edit({
		embeds: [buildRollingEmbed(challenge)],
		components: [],
	}).catch(() => {});

	await logDice(
		client,
		"Кости начались",
		[
			`Создатель: <@${challenge.creatorId}>`,
			`Соперник: <@${opponent.id}>`,
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Банк: ${formatCoins(challenge.amount * 2)} 🪙`,
		].join("\n"),
		Colors.Gold
	);

	scheduleRollFinish(client, challenge);
	return "ok";
}

export async function createDiceChallenge(
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
	const challenge: PersistedDiceChallenge = {
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
		creatorRoll: null,
		opponentRoll: null,
		winnerId: null,
	};

	diceChallenges.set(challengeId, challenge);

	await interaction.reply({
		embeds: [buildPendingEmbed(challenge)],
		components: [buildChallengeButtons(challengeId, !!targetUser)],
	});

	const reply = await interaction.fetchReply().catch(() => null);
	if (reply) challenge.messageId = reply.id;

	await upsertDiceChallenge(challenge);
	schedulePendingExpiry(interaction.client, challenge);

	await logDice(
		interaction.client,
		"Созданы кости",
		[
			`Создатель: <@${challenge.creatorId}>`,
			targetUser ? `Вызов: <@${targetUser.id}>` : "Режим: открытая игра",
			`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			`Автоотмена: <t:${Math.floor(challenge.expiresAt / 1000)}:R>`,
		].join("\n"),
		Colors.Blurple
	);
}

export async function restoreDiceChallenges(client: Client) {
	const persisted = await listDiceChallenges();

	for (const challenge of persisted) {
		if (challenge.status === "pending") {
			diceChallenges.set(challenge.id, challenge);
			if (challenge.expiresAt <= Date.now()) {
				await cancelDice(
					client,
					challenge,
					"Вызов автоматически отменён после перезапуска бота, потому что время ожидания уже истекло.",
					"Кости истекли"
				);
				continue;
			}
			schedulePendingExpiry(client, challenge);
			continue;
		}

		if (challenge.status === "rolling") {
			diceChallenges.set(challenge.id, challenge);
			if ((challenge.rollEndsAt ?? 0) <= Date.now()) {
				await finalizeDice(client, challenge);
				continue;
			}
			scheduleRollFinish(client, challenge);
		}
	}
}

export async function handleDiceUI(interaction: ButtonInteraction) {
	const isJoin = interaction.customId.startsWith(CUSTOM_IDS.DICE_JOIN);
	const isDecline = interaction.customId.startsWith(CUSTOM_IDS.DICE_DECLINE);
	if (!isJoin && !isDecline) return false;

	const challengeId = interaction.customId.replace(
		isJoin ? CUSTOM_IDS.DICE_JOIN : CUSTOM_IDS.DICE_DECLINE,
		""
	);
	const challenge = diceChallenges.get(challengeId);

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
		await logDice(
			interaction.client,
			"Кости отклонены",
			[
				`Создатель: <@${challenge.creatorId}>`,
				`Отклонил: <@${interaction.user.id}>`,
				`Ставка: ${formatCoins(challenge.amount)} 🪙`,
			].join("\n"),
			Colors.Red
		);
		diceChallenges.delete(challenge.id);
		await removeDiceChallenge(challenge.id);
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
	await startDice(interaction.client, interaction.message, challenge, opponent);
	return true;
}
