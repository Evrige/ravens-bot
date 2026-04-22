import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	TextChannel,
} from "discord.js";
import { CUSTOM_COMMAND } from "../../constants/customIds";
import { FAMILY_HIGH_ROLE_IDS } from "../../config/staff";
import { checkRolesOrReply } from "../../utils/checkRoles";
import {
	GIVEAWAY_TEMPLATE_CHOICES,
	GiveawayTemplateKey,
} from "../../config/giveawayTemplates";
import { buildGiveawaySendPayload } from "../../services/giveawayService";
import { mutateGiveaways, GiveawayRecord } from "../../utils/giveawayStore";

function createGiveawayId() {
	return `gw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const giveawayCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.GIVEAWAY)
		.setDescription("Создать новый giveaway в текущем канале")
		.addStringOption((option) =>
			option
				.setName("template")
				.setDescription("Шаблон оформления giveaway")
				.setRequired(true)
				.addChoices(...GIVEAWAY_TEMPLATE_CHOICES)
		)
		.addIntegerOption((option) =>
			option
				.setName("duration_days")
				.setDescription("Сколько дней будет идти розыгрыш")
				.setRequired(true)
				.setMinValue(1)
				.setMaxValue(365)
		)
		.addIntegerOption((option) =>
			option
				.setName("winners")
				.setDescription("Количество победителей")
				.setRequired(true)
				.setMinValue(1)
				.setMaxValue(20)
		)
		.addStringOption((option) =>
			option
				.setName("prize")
				.setDescription("Название приза")
				.setRequired(true)
				.setMaxLength(120)
		)
		.addStringOption((option) =>
			option
				.setName("description")
				.setDescription("Короткое описание или условия")
				.setRequired(false)
				.setMaxLength(500)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true }).catch(() => {});

		if (!(await checkRolesOrReply(interaction, FAMILY_HIGH_ROLE_IDS))) return;

		const channel = interaction.channel;
		if (!channel || !channel.isTextBased()) {
			return interaction.editReply("❌ Giveaway можно создать только в текстовом канале.");
		}

		const template = interaction.options.getString("template", true) as GiveawayTemplateKey;
		const durationDays = interaction.options.getInteger("duration_days", true);
		const winnersCount = interaction.options.getInteger("winners", true);
		const prize = interaction.options.getString("prize", true).trim();
		const description = interaction.options.getString("description")?.trim() || null;
		const id = createGiveawayId();
		const endAt = new Date(Date.now() + durationDays * 24 * 60 * 60_000);

		const draftGiveaway: GiveawayRecord = {
			id,
			guildId: interaction.guildId ?? "",
			channelId: channel.id,
			messageId: "pending",
			creatorId: interaction.user.id,
			prize,
			description,
			winnersCount,
			endAt: endAt.toISOString(),
			template,
			participants: [],
			winners: [],
			ended: false,
			announcementSent: false,
			announcementMessageId: null,
			createdAt: new Date().toISOString(),
			endedAt: null,
		};

		const sent = await (channel as TextChannel).send(buildGiveawaySendPayload(draftGiveaway));

		await mutateGiveaways((records) => {
			records.push({
				...draftGiveaway,
				messageId: sent.id,
			});
		});

		return interaction.editReply(
			`✅ Giveaway создан. Сообщение опубликовано в <#${channel.id}> и закроется автоматически.`
		);
	},
};
