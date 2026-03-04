import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	EmbedBuilder,
	TextChannel,
	ChannelType
} from "discord.js";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { prisma } from "../../utils/prisma";
import { updateWeeklyFeePanel } from "../../services/updateWeeklyFeePanel";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { config } from "../../config/env";

function parseDateYYYYMMDD(s: string) {
	// ожидаем "YYYY-MM-DD"
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return null;
	const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
	const dt = new Date(y, mo, d);
	dt.setHours(0, 0, 0, 0);
	// проверка на мусорные даты
	if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
	return dt;
}

function startOfDay(d: Date) {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function addDays(date: Date, days: number) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatYYYYMMDD(d: Date) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

async function sendWeeklyFeeLog(params: {
	interaction: ChatInputCommandInteraction;
	targetUserId: string;
	amount: number;
	from: Date;
	oldTotalPaid?: number | null;
	newTotalPaid?: number | null;
}) {
	try {
		const logChannelId = config.FAMILY_LOG_CHANNEL_ID;
		if (!logChannelId) return;

		const ch = await params.interaction.client.channels.fetch(logChannelId).catch(() => null);
		if (!ch || ch.type !== ChannelType.GuildText) return;

		const actor = params.interaction.user;
		const embed = new EmbedBuilder()
			.setTitle("💰 Недельный взнос")
			.setDescription(
				`**${actor}** занёс оплату взноса для **<@${params.targetUserId}>**\n` +
				`Сумма: **${params.amount.toLocaleString()}🪙**`
			)
			.addFields(
				{ name: "Дата начала (from)", value: `\`${formatYYYYMMDD(params.from)}\``, inline: true },
				{ name: "Команда", value: `\`/${CUSTOM_COMMAND.FEE_ADD}\``, inline: true },
			)
			.setTimestamp();

		// если хочешь показывать было/стало — оставил
		if (typeof params.oldTotalPaid === "number" && typeof params.newTotalPaid === "number") {
			embed.addFields({
				name: "Всего оплачено",
				value:
					`Было: **${params.oldTotalPaid.toLocaleString()}🪙**\n` +
					`Стало: **${params.newTotalPaid.toLocaleString()}🪙**`,
				inline: false
			});
		}

		await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
	} catch {
		// не ломаем команду
	}
}

export const weeklyFeeAddCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FEE_ADD)
		.setDescription("Добавить оплату недельного взноса")
		.addUserOption(o => o.setName("user").setDescription("Кому").setRequired(true))
		.addIntegerOption(o => o.setName("amount").setDescription("Сколько заплатил (монет)").setRequired(true).setMinValue(1))
		.addStringOption(o => o.setName("from").setDescription("С какого числа (YYYY-MM-DD), если не указать — сегодня").setRequired(false)),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const user = interaction.options.getUser("user", true);
		const amount = interaction.options.getInteger("amount", true);
		const fromRaw = interaction.options.getString("from", false);

		const from = fromRaw ? parseDateYYYYMMDD(fromRaw) : startOfDay(new Date());
		if (!from) return interaction.editReply("❌ Неверная дата. Формат: YYYY-MM-DD");

		// текущая цена
		const settings = await prisma.weeklyFeeSettings.upsert({
			where: { id: 1 },
			update: {},
			create: { id: 1, price: 50000 }
		});
		const price = settings.price;

		const existing = await prisma.weeklyFeePayment.findUnique({ where: { userId: user.id } });

		const oldTotalPaid = existing?.totalPaid ?? null;

		// считаем текущую paidUntil, чтобы правильно “платить наперёд”
		let newPaidFrom = from;
		let newTotalPaid = amount;

		if (existing) {
			const weeks = Math.floor(existing.totalPaid / price);
			const currentPaidUntil = addDays(startOfDay(existing.paidFrom), weeks * 7);

			// если на дату "from" у него ещё действует оплата — просто наращиваем totalPaid
			if (currentPaidUntil.getTime() >= from.getTime()) {
				newPaidFrom = existing.paidFrom;
				newTotalPaid = existing.totalPaid + amount;
			} else {
				// если просрочено — начинаем новый период с from
				newPaidFrom = from;
				newTotalPaid = amount;
			}
		}

		await prisma.weeklyFeePayment.upsert({
			where: { userId: user.id },
			update: { paidFrom: newPaidFrom, totalPaid: newTotalPaid },
			create: { userId: user.id, paidFrom: newPaidFrom, totalPaid: newTotalPaid }
		});

		await updateWeeklyFeePanel(interaction.client).catch(() => {});

		// ✅ лог в канал
		await sendWeeklyFeeLog({
			interaction,
			targetUserId: user.id,
			amount,
			from: newPaidFrom,
			oldTotalPaid,
			newTotalPaid
		});

		return interaction.editReply(`✅ Оплата добавлена для <@${user.id}>: **${amount.toLocaleString()}🪙**`);
	}
};