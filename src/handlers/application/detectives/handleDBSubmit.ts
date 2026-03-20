import {
	ChannelType,
	PermissionFlagsBits,
	EmbedBuilder,
	MessageFlags,
	GuildMember,
	OverwriteResolvable,
} from "discord.js";
import { prisma } from "../../../utils/prisma";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { DB_STAFF_ROLE_IDS } from "../../../config/staff";
import { buildHiveEmbed } from "./buildHiveEmbed";
import { buildDBButtons } from "./handleDBButtons";
import { resetHivePanel } from "../../../services/upsertHivePanel";

function typeLabelFromInput(v: string) {
	return v === "1" ? "Обязательная" : "Не обязательная";
}

function isStaff(member: GuildMember) {
	return member.roles.cache.some((r) => DB_STAFF_ROLE_IDS.includes(r.id));
}

function buildChannelOverwrites(guildId: string, userId: string): OverwriteResolvable[] {
	const validRoleIds = DB_STAFF_ROLE_IDS.filter(
		(roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0
	);

	return [
		{
			id: guildId,
			deny: [PermissionFlagsBits.ViewChannel],
		},
		{
			id: userId,
			allow: [
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ReadMessageHistory,
			],
		},
		...validRoleIds.map((roleId) => ({
			id: roleId,
			allow: [
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ReadMessageHistory,
			],
		})),
	];
}

async function findApplicationMessageByHiveId(channel: any, hiveIdStr: string) {
	const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
	if (!messages) return null;

	return (
		messages.find((m: any) =>
			m.components?.some((row: any) =>
				row.components?.some((btn: any) => {
					const id = btn.customId || "";
					return (
						id === `${CUSTOM_IDS.ACCEPT}${hiveIdStr}` ||
						id === `${CUSTOM_IDS.DECLINE}${hiveIdStr}` ||
						id.startsWith(`${CUSTOM_IDS.CHANGE}${hiveIdStr}:`)
					);
				})
			)
		) ?? null
	);
}

export async function handleDBSubmit(interaction: any) {
	if (!interaction.isModalSubmit()) return;

	// ----------- РЕДАКТИРОВАНИЕ ----------- //
	if (interaction.customId.startsWith(CUSTOM_IDS.MODAL_EDIT)) {
		const messageId = interaction.customId.replace(CUSTOM_IDS.MODAL_EDIT, "");
		const channel = interaction.channel;
		if (!channel?.isTextBased()) return;

		const message = await channel.messages.fetch(messageId).catch(() => null);
		if (!message) {
			return interaction.reply({
				content: "❌ Сообщение не найдено.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const embed = message.embeds[0];
		if (!embed) {
			return interaction.reply({
				content: "❌ Embed не найден.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const gameName = interaction.fields.getTextInputValue(CUSTOM_IDS.GAME_NAME).trim();
		const typeInput = interaction.fields.getTextInputValue(CUSTOM_IDS.HIVE_TYPE).trim();
		const story = interaction.fields.getTextInputValue(CUSTOM_IDS.STORY).trim();
		const video = interaction.fields.getTextInputValue(CUSTOM_IDS.VIDEO).trim();

		if (typeInput !== "1" && typeInput !== "0") {
			return interaction.reply({
				content: "❌ Введите только `1` или `0`",
				flags: MessageFlags.Ephemeral,
			});
		}

		const updated = EmbedBuilder.from(embed);

		const newFields = (updated.data.fields || []).map((f: any) => {
			if (f.name === "Имя в игре") return { ...f, value: gameName || "-" };
			if (f.name === "Тип улики") return { ...f, value: typeLabelFromInput(typeInput) };
			if (f.name === "Видео") return { ...f, value: video || "-" };
			if (f.name === "Подробный рассказ") {
				return { ...f, value: (story || "-").slice(0, 1024) };
			}
			return f;
		});

		updated.setFields(newFields);
		await message.edit({ embeds: [updated] }).catch(() => {});

		return interaction.reply({
			content: "✏️ Заявка обновлена",
			flags: MessageFlags.Ephemeral,
		});
	}

	// ----------- ОТКЛОНЕНИЕ УЛИКИ ----------- //
	if (interaction.customId.startsWith(`${CUSTOM_IDS.HIVE_DECLINE_REASON}:`)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({
				content: "❌ У вас нет прав.",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const hiveIdStr = interaction.customId.split(":")[1];
		const hiveId = BigInt(hiveIdStr);

		const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.REASON)?.trim();
		if (!reason) {
			return interaction.editReply("❌ Причина отклонения не указана.");
		}

		const hive = await prisma.hive.findUnique({
			where: { id: hiveId },
			include: { organisation: true },
		});

		if (!hive) {
			return interaction.editReply("❌ Улика не найдена.");
		}

		await prisma.hive.update({
			where: { id: hiveId },
			data: {
				status: "REJECTED",
			},
		}).catch(() => {});

		try {
			const user = await interaction.client.users.fetch(hive.userId).catch(() => null);
			if (user) {
				const userEmbed = new EmbedBuilder()
					.setColor("Red")
					.setTitle("❌ Ваша улика отклонена")
					.addFields(
						{
							name: "Организация",
							value: hive.organisation?.name ?? `ID: ${hive.organisationId.toString()}`,
							inline: true,
						},
						{ name: "Причина", value: reason, inline: false }
					)
					.setFooter({ text: "by Evri" })
					.setTimestamp();

				await user.send({ embeds: [userEmbed] }).catch(() => {});
			}
		} catch {}

		// удаляем только сообщение заявки, канал НЕ трогаем
		const channel = interaction.channel;
		if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
			const applicationMessage = await findApplicationMessageByHiveId(channel, hiveIdStr);
			if (applicationMessage) {
				await applicationMessage.delete().catch(() => {});
			}
		}

		await resetHivePanel(interaction.client).catch(() => {});
		return interaction.editReply("✅ Улика отклонена.");
	}

	// ----------- НОВАЯ УЛИКА ----------- //
	if (interaction.customId.startsWith(`${CUSTOM_IDS.HIVE_MODAL_NEW}:`)) {
		const organisationIdStr = interaction.customId.split(":")[1];
		const organisationId = BigInt(organisationIdStr);

		const guild = interaction.guild;
		if (!guild) {
			return interaction.reply({
				content: "❌ Сервер не найден.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
		if (!org) {
			return interaction.reply({
				content: "❌ Организация не найдена.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const typeInput = interaction.fields.getTextInputValue(CUSTOM_IDS.HIVE_TYPE).trim();
		if (typeInput !== "1" && typeInput !== "0") {
			return interaction.reply({
				content: "❌ Введите только `1` или `0`",
				flags: MessageFlags.Ephemeral,
			});
		}

		const gameName = interaction.fields.getTextInputValue(CUSTOM_IDS.GAME_NAME).trim();
		const story = interaction.fields.getTextInputValue(CUSTOM_IDS.STORY).trim();
		const video = interaction.fields.getTextInputValue(CUSTOM_IDS.VIDEO).trim();

		const hive = await prisma.hive.create({
			data: {
				userId: interaction.user.id,
				organisationId,
				type: typeInput === "1" ? "REQUIRED" : "OPTIONAL",
				link: video || "",
				story,
				form: "ONE_HALF",
				status: "PENDING",
			},
		});

		const safeUsername = interaction.user.username
			.toLowerCase()
			.replace(/[^a-zа-яё0-9-_]/gi, "-")
			.replace(/-+/g, "-")
			.slice(0, 80);

		const channelName = `заявка-${safeUsername}`;
		const categoryId = process.env.DB_CATEGORY_ID;

		let appChannel = guild.channels.cache.find(
			(ch: any) => ch.name === channelName && ch.type === ChannelType.GuildText
		);

		if (!appChannel) {
			const overwrites = buildChannelOverwrites(guild.id, interaction.user.id);

			appChannel = await guild.channels.create({
				name: channelName,
				type: ChannelType.GuildText,
				parent: categoryId,
				permissionOverwrites: overwrites,
			});
		}

		const embed = buildHiveEmbed({
			organisationName: org.name,
			gameName,
			hiveTypeLabel: typeLabelFromInput(typeInput),
			video: video || "-",
			story,
			authorId: interaction.user.id,
		});

		const buttons = buildDBButtons(hive.id.toString(), interaction.user.id);

		if (appChannel?.isTextBased()) {
			const validRoleMentions = DB_STAFF_ROLE_IDS
				.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
				.map((id) => `<@&${id}>`)
				.join(" ");

			await appChannel.send({
				content: validRoleMentions || undefined,
				embeds: [embed],
				components: [buttons],
			});
		}

		await resetHivePanel(interaction.client).catch(() => {});
		return interaction.reply({
			content: `✅ Ваша заявка отправлена в канал #${appChannel?.name}`,
			flags: MessageFlags.Ephemeral,
		});
	}
}