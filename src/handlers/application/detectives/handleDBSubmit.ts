import {
	ChannelType,
	PermissionFlagsBits,
	EmbedBuilder,
	Message,
} from "discord.js";
import { prisma } from "../../../utils/prisma";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { DB_STAFF_ROLE_IDS } from "../../../config/staff";
import { buildHiveEmbed } from "./buildHiveEmbed";
import {buildDBButtons} from "./handleDBButtons";
import {resetHivePanel} from "../../../services/upsertHivePanel";

function typeLabelFromInput(v: string) {
	return v === "1" ? "Обязательная" : "Не обязательная";
}

export async function handleDBSubmit(interaction: any) {

	// ----------- РЕДАКТИРОВАНИЕ ----------- //
	if (interaction.customId.startsWith(CUSTOM_IDS.MODAL_EDIT)) {
		const messageId = interaction.customId.replace(CUSTOM_IDS.MODAL_EDIT, "");
		const channel = interaction.channel;
		if (!channel?.isTextBased()) return;

		const message = await channel.messages.fetch(messageId);
		const embed = message.embeds[0];
		if (!embed) return interaction.reply({ content: "❌ Embed не найден.", ephemeral: true });

		const gameName = interaction.fields.getTextInputValue(CUSTOM_IDS.GAME_NAME).trim();
		const typeInput = interaction.fields.getTextInputValue(CUSTOM_IDS.HIVE_TYPE).trim();
		const story = interaction.fields.getTextInputValue(CUSTOM_IDS.STORY).trim();
		const video = interaction.fields.getTextInputValue(CUSTOM_IDS.VIDEO).trim();

		if (typeInput !== "1" && typeInput !== "0") {
			return interaction.reply({ content: "❌ Введите только `1` или `0`", ephemeral: true });
		}

		const updated = EmbedBuilder.from(embed);

		const newFields = (updated.data.fields || []).map((f: any) => {
			if (f.name === "Имя в игре") return { ...f, value: gameName || "-" };
			if (f.name === "Тип улики") return { ...f, value: typeLabelFromInput(typeInput) };
			if (f.name === "Видео") return { ...f, value: video || "-" };
			if (f.name === "Подробный рассказ") return { ...f, value: (story || "-").slice(0, 1024) };
			return f;
		});

		updated.setFields(newFields);
		await message.edit({ embeds: [updated] });

		return interaction.reply({ content: "✏️ Заявка обновлена", ephemeral: true });
	}

	// ----------- НОВАЯ УЛИКА ----------- //
	// customId: hive_modal_new:<orgId>
	if (interaction.customId.startsWith(`${CUSTOM_IDS.HIVE_MODAL_NEW}:`)) {
		const organisationIdStr = interaction.customId.split(":")[1];
		const organisationId = BigInt(organisationIdStr);

		const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
		if (!org) {
			return interaction.reply({ content: "❌ Организация не найдена.", ephemeral: true });
		}

		const typeInput = interaction.fields.getTextInputValue(CUSTOM_IDS.HIVE_TYPE).trim();
		if (typeInput !== "1" && typeInput !== "0") {
			return interaction.reply({ content: "❌ Введите только `1` или `0`", ephemeral: true });
		}

		const gameName = interaction.fields.getTextInputValue(CUSTOM_IDS.GAME_NAME).trim();
		const story = interaction.fields.getTextInputValue(CUSTOM_IDS.STORY).trim();
		const video = interaction.fields.getTextInputValue(CUSTOM_IDS.VIDEO).trim();

		// ✅ создаём запись в БД
		const hive = await prisma.hive.create({
			data: {
				userId: interaction.user.id,
				organisationId,
				type: typeInput === "1" ? "REQUIRED" : "OPTIONAL", // если у тебя enum HiveType
				link: video || "",
				story,
				form: "ONE_HALF",
				status: "PENDING",
			},
		});

		// ✅ создаём личный канал заявки
		const channelName = `заявка-${interaction.user.username.toLowerCase()}`;
		const categoryId = process.env.DB_CATEGORY_ID!;
		const guild = interaction.guild;

		let appChannel = guild?.channels.cache.find(
			(ch: any) => ch.name === channelName && ch.type === ChannelType.GuildText
		);

		if (!appChannel) {
			appChannel = await guild?.channels.create({
				name: channelName,
				type: ChannelType.GuildText,
				parent: categoryId,
				permissionOverwrites: [
					{ id: guild!.id, deny: [PermissionFlagsBits.ViewChannel] },
					{
						id: interaction.user.id,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory
						]
					},
					...DB_STAFF_ROLE_IDS.map(roleId => ({
						id: roleId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory
						]
					}))
				]
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
			const mentionText = DB_STAFF_ROLE_IDS.map((id: any) => `<@&${id}>`).join(" ");
			await appChannel.send({
				content: mentionText || undefined,
				embeds: [embed],
				components: [buttons]
			});
		}
		await resetHivePanel(interaction.client).catch(() => {});
		return interaction.reply({
			content: `✅ Ваша заявка отправлена в канал #${appChannel?.name}`,
			ephemeral: true
		});
	}
}