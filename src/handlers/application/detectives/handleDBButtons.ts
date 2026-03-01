import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	GuildMember,
	Message,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { prisma } from "../../../utils/prisma";
import { CUSTOM_IDS } from "../../../constants/customIds";
import { DB_STAFF_ROLE_IDS } from "../../../config/staff";
import { createButton } from "../../../components/createButton";
import { config } from "../../../config/env";
import { openDBApplicationModal } from "./openDBApplicationModal";
import {postHiveToForum} from "./postHiveToOrgForum";

function isStaff(member: GuildMember) {
	return member.roles.cache.some(r => DB_STAFF_ROLE_IDS.includes(r.id));
}

export function buildDBButtons(hiveId: string, ownerId: string) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		createButton({
			customId: `${CUSTOM_IDS.ACCEPT}${hiveId}`,
			label: "Принять",
			style: ButtonStyle.Success
		}),
		createButton({
			customId: `${CUSTOM_IDS.DECLINE}${hiveId}`,
			label: "Отклонить",
			style: ButtonStyle.Danger
		}),
		createButton({
			customId: `${CUSTOM_IDS.CHANGE}${hiveId}:${ownerId}`,
			label: "✏️ Редактировать",
			style: ButtonStyle.Secondary
		}),
	);
}

export async function handleDBButtons(interaction: any) {
	if (!interaction.isButton()) return;

	// ===================== COPY_TEXT (в логе) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.COPY_TEXT)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		// ✅ сразу отвечаем
		await interaction.deferReply({ ephemeral: true });

		const hiveIdStr = interaction.customId.replace(CUSTOM_IDS.COPY_TEXT, "");

		const embed = interaction.message.embeds[0];
		if (!embed) return interaction.editReply("❌ Embed не найден.");

		const getField = (name: string) =>
			embed.fields.find((f: any) => f.name === name)?.value ?? "";

		const text =
			`**Имя**\n${getField("Имя в игре")}\n\n` +
			`**Ссылка**\n${getField("Видео")}\n\n` +
			`**Подробный рассказ**\n${getField("Подробный рассказ")}\n\n`;

		try {
			await interaction.user.send({ content: text });
			await interaction.editReply("✅ Текст отправлен в ЛС 📬");
		} catch {
			await interaction.editReply("❌ Не удалось отправить ЛС.");
		}

		// ✅ добавляем кнопки ✅/❌ один раз
		const msg = interaction.message;
		const hasRow = msg.components.some((row: any) =>
			row.components.some((btn: any) =>
				(btn.customId || "").startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
				(btn.customId || "").startsWith(CUSTOM_IDS.DECLINE_HIVE)
			)
		);

		if (!hasRow) {
			const acceptBtn = createButton({
				customId: `${CUSTOM_IDS.ACCEPT_HIVE}${hiveIdStr}`,
				label: "✅",
				style: ButtonStyle.Success
			});
			const declineBtn = createButton({
				customId: `${CUSTOM_IDS.DECLINE_HIVE}${hiveIdStr}`,
				label: "❌",
				style: ButtonStyle.Danger
			});

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

			await msg.edit({ components: [...msg.components, row] }).catch(() => {});
			await msg.react("👀").catch(() => {});
		}

		return;
	}

	// ===================== ✅/❌ после COPY (в логе) =====================
	if (
		interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
		interaction.customId.startsWith(CUSTOM_IDS.DECLINE_HIVE)
	) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		// ✅ сразу отвечаем на кнопку
		await interaction.deferUpdate();

		const isAccept = interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE);
		const hiveIdStr = interaction.customId.replace(
			isAccept ? CUSTOM_IDS.ACCEPT_HIVE : CUSTOM_IDS.DECLINE_HIVE,
			""
		);

		// ✅ если accept — публикуем в форум
		if (isAccept) {
			const embed = interaction.message.embeds[0];
			const res = await postHiveToForum({
				guild: interaction.guild,
				hiveIdStr,
				embed,
			});

			if (!res.ok) {
				await interaction.followUp({
					content: `⚠️ Не удалось опубликовать в форум: ${res.reason}`,
					ephemeral: true
				}).catch(() => {});
			}
		}

		// чистим кнопки и ставим реакцию
		const msg = interaction.message;

		await msg.reactions.removeAll().catch(() => {});
		await msg.edit({
			components: msg.components.filter((row: any) =>
				!row.components.some((btn: any) =>
					(btn.customId || "").startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
					(btn.customId || "").startsWith(CUSTOM_IDS.DECLINE_HIVE)
				)
			)
		}).catch(() => {});
		await msg.react(isAccept ? "✅" : "❌").catch(() => {});
		return;
	}

	// ===================== РЕДАКТИРОВАТЬ (в личном канале) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.CHANGE)) {
		const payload = interaction.customId.replace(CUSTOM_IDS.CHANGE, "");
		const [hiveIdStr, ownerId] = payload.split(":");

		if (interaction.user.id !== ownerId) {
			return interaction.reply({ content: "❌ Редактировать может только автор.", ephemeral: true });
		}

		return openDBApplicationModal(interaction, interaction.message.embeds[0]?.fields, interaction.message.id);
	}

	// ===================== ПРИНЯТЬ (в личном канале) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.ACCEPT)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		// 1) ACK сразу
		await interaction.deferReply({ ephemeral: true });

		// 2) СРАЗУ создаём оригинальный ephemeral-ответ (важно!)
		await interaction.editReply("⏳ Принимаю улику, подожди...").catch(() => {});

		const hiveIdStr = interaction.customId.replace(CUSTOM_IDS.ACCEPT, "");
		const hiveId = BigInt(hiveIdStr);

		const hive = await prisma.hive.findUnique({
			where: { id: hiveId },
			include: { organisation: true },
		});
		if (!hive) {
			return interaction.editReply("❌ Улика не найдена.").catch(() => {});
		}

		await prisma.hive.update({
			where: { id: hiveId },
			data: { status: "ACCEPTED" },
		});

		const appMessage = interaction.message;
		const originalEmbed = appMessage.embeds[0];
		if (!originalEmbed) {
			return interaction.editReply("❌ Embed не найден.").catch(() => {});
		}

		const moderator = interaction.user;

		const resultEmbed = EmbedBuilder.from(originalEmbed)
			.setColor("Green")
			.addFields({ name: "✅ Принял", value: `<@${moderator.id}>`, inline: true })
			.setFooter({ text: "by Evri" })
			.setTimestamp();

		// отправка в лог
		const logChannel = interaction.guild?.channels.cache.get(config.DB_LOG_CHANNEL_ID);
		if (logChannel?.isTextBased()) {
			const copyBtn = createButton({
				customId: `${CUSTOM_IDS.COPY_TEXT}${hiveIdStr}`,
				label: "📋 Скопировать текст",
				style: ButtonStyle.Secondary,
			});
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(copyBtn);

			await logChannel.send({ embeds: [resultEmbed], components: [row] }).catch(() => {});
		}

		// ВАЖНО: СНАЧАЛА финальный ответ пользователю (или followUp), ПОТОМ удаления
		// Тут лучше followUp, чтобы не зависеть от @original
		await interaction.followUp({
			content: "✅ Улика принята и отправлена в лог.",
			ephemeral: true,
		}).catch(async () => {
			// fallback если followUp не прошёл
			await interaction.editReply("✅ Улика принята и отправлена в лог.").catch(() => {});
		});

		// теперь можно удалять заявку
		await appMessage.delete().catch(() => {});

		// и чистить канал (после ответа!)
		const appChannel = appMessage.channel;
		if (appChannel?.isTextBased()) {
			const messages = await appChannel.messages.fetch({ limit: 50 }).catch(() => null);
			if (messages) {
				const remaining = messages.filter((m: Message) =>
					m.author.id === interaction.client.user!.id &&
					m.embeds.length > 0 &&
					m.embeds[0].title === "Улика"
				);

				if (remaining.size === 0) {
					await appChannel.delete().catch(() => {});
				}
			}
		}

		return;
	}

	// ===================== ОТКЛОНИТЬ (в личном канале) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.DECLINE)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		const hiveIdStr = interaction.customId.replace(CUSTOM_IDS.DECLINE, "");

		const modal = new ModalBuilder()
			// ✅ ВАЖНО: тот же префикс и формат, который ждёт handleHiveDeclineReasonSubmit
			.setCustomId(`${CUSTOM_IDS.HIVE_DECLINE_REASON}:${hiveIdStr}`)
			.setTitle("Причина отклонения");

		const reasonInput = new TextInputBuilder()
			.setCustomId(CUSTOM_IDS.REASON)
			.setLabel("Причина")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

		return interaction.showModal(modal);
	}
}