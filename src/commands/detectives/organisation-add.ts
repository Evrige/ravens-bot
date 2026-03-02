import {
	ChatInputCommandInteraction,
	ChannelType,
	ForumChannel,
	SlashCommandBuilder,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { config } from "../../config/env";
import { resetHivePanel } from "../../services/upsertHivePanel";

function getForumIdByType(type: "FAMILY" | "FRACTION") {
	return type === "FAMILY"
		? config.DB_FORUM_FAMILY_ID
		: config.DB_FORUM_FRACTION_ID;
}

export const organisationAddCommand = {
	data: new SlashCommandBuilder()
		.setName("organisation-add")
		.setDescription("Создать организацию")

		.addStringOption(option =>
			option
				.setName("name")
				.setDescription("Название")
				.setRequired(true)
		)

		.addStringOption(option =>
			option
				.setName("type")
				.setDescription("Тип")
				.setRequired(true)
				.addChoices(
					{ name: "FAMILY", value: "FAMILY" },
					{ name: "FRACTION", value: "FRACTION" }
				)
		)

		.addStringOption(option =>
			option
				.setName("color")
				.setDescription("HEX цвет (#ff0000)")
				.setRequired(true)
		)

		// ✅ НОВОЕ ПОЛЕ subject (необязательно)
		.addStringOption(option =>
			option
				.setName("subject")
				.setDescription("Описание / субъект организации")
				.setRequired(false)
		)

		// ✅ НОВОЕ ПОЛЕ adress (необязательно)
		.addStringOption(option =>
			option
				.setName("adress")
				.setDescription("Адрес организации")
				.setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		if (!interaction.guild) {
			return interaction.editReply("❌ Команда доступна только на сервере.");
		}

		const name = interaction.options.getString("name", true).trim();
		const type = interaction.options.getString("type", true) as "FAMILY" | "FRACTION";
		const color = interaction.options.getString("color")?.trim() ?? "#5865F2";

		// ✅ получаем новые поля
		const subject = interaction.options.getString("subject")?.trim() || null;
		const adress = interaction.options.getString("adress")?.trim() || null;

		const exists = await prisma.organisation.findFirst({ where: { name } });
		if (exists) {
			return interaction.editReply("❌ Такая организация уже существует.");
		}

		const forumId = getForumIdByType(type);
		if (!forumId) {
			return interaction.editReply("❌ Forum ID не задан в env.");
		}

		const forumCh = interaction.guild.channels.cache.get(forumId);
		if (!forumCh || forumCh.type !== ChannelType.GuildForum) {
			return interaction.editReply("❌ Forum-канал не найден или это не форум.");
		}

		const forum = forumCh as ForumChannel;

		// 1️⃣ создаём организацию
		const org = await prisma.organisation.create({
			data: {
				name,
				type,
				color,
				subject,
				adress,
			},
		});

		// 2️⃣ создаём тред в форуме
		let thread: ThreadChannel;
		try {
			const created = await forum.threads.create({
				name: `🏛️ ${name}`,
				message: {
					content:
						`Канал организации **${name}**.\n` +
						(subject ? `📌 Описание: ${subject}\n` : "") +
						(adress ? `📍 Адрес: ${adress}\n` : "") +
						`\nСюда будут попадать принятые улики.`,
				},
			});
			thread = created;
		} catch (e: any) {
			return interaction.editReply(
				`❌ Не удалось создать тред в форуме: ${e?.message ?? e}`
			);
		}

		// 3️⃣ сохраняем thread.id
		await prisma.organisation.update({
			where: { id: org.id },
			data: { channelId: thread.id },
		});

		// 4️⃣ обновляем панель
		const refreshed = await resetHivePanel(interaction.client);

		return interaction.editReply(
			`✅ Организация **${name}** создана.\n` +
			`📌 В форуме создан тред: **${thread.name}**.\n` +
			(refreshed.ok
				? `🔄 Панель улик обновлена.`
				: `⚠️ Панель улик не обновлена: **${refreshed.reason ?? "unknown"}**`)
		);
	},
};
