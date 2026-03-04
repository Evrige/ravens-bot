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

async function sendWeeklyFeeRemoveLog(params: {
	interaction: ChatInputCommandInteraction;
	targetUserId: string;
	amount: number;
	oldTotalPaid: number;
	newTotalPaid: number;
}) {
	try {
		const ch = await params.interaction.client.channels
			.fetch(config.FAMILY_LOG_CHANNEL_ID)
			.catch(() => null);

		if (!ch || ch.type !== ChannelType.GuildText) return;

		const actor = params.interaction.user;

		const embed = new EmbedBuilder()
			.setTitle("❌ Удаление оплаты взноса")
			.setDescription(
				`**${actor}** удалил оплату взноса у **<@${params.targetUserId}>**`
			)
			.addFields(
				{
					name: "Сумма",
					value: `**${params.amount.toLocaleString()}🪙**`,
					inline: true
				},
				{
					name: "Было",
					value: `**${params.oldTotalPaid.toLocaleString()}🪙**`,
					inline: true
				},
				{
					name: "Стало",
					value: `**${params.newTotalPaid.toLocaleString()}🪙**`,
					inline: true
				}
			)
			.setTimestamp();

		await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
	} catch {}
}

export const weeklyFeeRemoveCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FEE_REMOVE)
		.setDescription("Удалить оплату недельного взноса")
		.addUserOption(o =>
			o.setName("user")
				.setDescription("У кого убрать оплату")
				.setRequired(true)
		)
		.addIntegerOption(o =>
			o.setName("amount")
				.setDescription("Сколько убрать (монет)")
				.setRequired(true)
				.setMinValue(1)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const user = interaction.options.getUser("user", true);
		const amount = interaction.options.getInteger("amount", true);

		const payment = await prisma.weeklyFeePayment.findUnique({
			where: { userId: user.id }
		});

		if (!payment) {
			return interaction.editReply("❌ У пользователя нет оплат.");
		}

		const oldTotalPaid = payment.totalPaid;
		const newTotalPaid = Math.max(0, payment.totalPaid - amount);

		await prisma.weeklyFeePayment.update({
			where: { userId: user.id },
			data: { totalPaid: newTotalPaid }
		});

		await updateWeeklyFeePanel(interaction.client).catch(() => {});

		// лог
		await sendWeeklyFeeRemoveLog({
			interaction,
			targetUserId: user.id,
			amount,
			oldTotalPaid,
			newTotalPaid
		});

		return interaction.editReply(
			`✅ У <@${user.id}> убрано **${amount.toLocaleString()}🪙**`
		);
	}
};