// src/commands/detectives/db/handleDBButtons.ts
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
import { postHiveToForum } from "./postHiveToOrgForum";

function isStaff(member: GuildMember) {
	return member.roles.cache.some((r) => DB_STAFF_ROLE_IDS.includes(r.id));
}

export function buildDBButtons(hiveId: string, ownerId: string) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		createButton({
			customId: `${CUSTOM_IDS.ACCEPT}${hiveId}`,
			label: "Принять",
			style: ButtonStyle.Success,
		}),
		createButton({
			customId: `${CUSTOM_IDS.DECLINE}${hiveId}`,
			label: "Отклонить",
			style: ButtonStyle.Danger,
		}),
		createButton({
			customId: `${CUSTOM_IDS.CHANGE}${hiveId}:${ownerId}`,
			label: "✏️ Редактировать",
			style: ButtonStyle.Secondary,
		}),
	);
}

// выбор формы (только после ✅ для OPTIONAL)
function buildFormButtons(hiveIdStr: string) {
	const half = createButton({
		customId: `${CUSTOM_IDS.SET_FORM}${hiveIdStr}:ONE_HALF`,
		label: "1/2",
		style: ButtonStyle.Secondary,
	});

	const fifth = createButton({
		customId: `${CUSTOM_IDS.SET_FORM}${hiveIdStr}:ONE_FIFTH`,
		label: "1/5",
		style: ButtonStyle.Secondary,
	});

	return new ActionRowBuilder<ButtonBuilder>().addComponents(half, fifth);
}

function removeRows(msg: any) {
	return msg.components.filter((row: any) =>
		!row.components.some((btn: any) => {
			const id = btn.customId || "";
			return (
				id.startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
				id.startsWith(CUSTOM_IDS.DECLINE_HIVE) ||
				id.startsWith(CUSTOM_IDS.SET_FORM)
			);
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

		// ✅ добавляем ✅/❌ один раз
		const msg = interaction.message;
		const hasRow = msg.components.some((row: any) =>
			row.components.some((btn: any) =>
				(btn.customId || "").startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
				(btn.customId || "").startsWith(CUSTOM_IDS.DECLINE_HIVE),
			),
		);

		if (!hasRow) {
			const acceptBtn = createButton({
				customId: `${CUSTOM_IDS.ACCEPT_HIVE}${hiveIdStr}`,
				label: "✅",
				style: ButtonStyle.Success,
			});
			const declineBtn = createButton({
				customId: `${CUSTOM_IDS.DECLINE_HIVE}${hiveIdStr}`,
				label: "❌",
				style: ButtonStyle.Danger,
			});

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

			await msg.edit({ components: [...msg.components, row] }).catch(() => {});
			await msg.react("👀").catch(() => {});
		}

		return;
	}

	// ===================== SET_FORM (нажал 1/2 или 1/5 в логе) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.SET_FORM)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		await interaction.deferUpdate();

		const payload = interaction.customId.replace(CUSTOM_IDS.SET_FORM, "");
		const [hiveIdStr, formRaw] = payload.split(":"); // ONE_HALF / ONE_FIFTH

		const hiveId = BigInt(hiveIdStr);

		// берём logUrl из БД (fallback на текущую кнопку)
		const hive = await prisma.hive.findUnique({
			where: { id: hiveId },
			include: { organisation: true },
		});

		const logUrl = hive?.logUrl ?? interaction.message.url;

		// ✅ сохраняем форму в БД
		const formEnum =
			formRaw === "ONE_HALF" ? "ONE_HALF" :
				formRaw === "ONE_QUARTER" ? "ONE_QUARTER" :
					"ONE_FIFTH";

		await prisma.hive.update({
			where: { id: hiveId },
			data: { status: "ACCEPTED", form: formEnum },
		}).catch(() => {});

		const formLabel = formEnum === "ONE_HALF" ? "1/2" : formEnum === "ONE_QUARTER" ? "1/4" : "1/5";

		// ✅ обновляем сводку в форуме
		const res = await postHiveToForum({
			guild: interaction.guild,
			hiveIdStr,
		});

		if (!res.ok) {
			await interaction.followUp({
				content: `⚠️ Не удалось обновить сводку: ${res.reason}`,
				ephemeral: true,
			}).catch(() => {});
		}

		// чистим кнопки выбора и ставим ✅ реакцию
		const msg = interaction.message;
		await msg.reactions.removeAll().catch(() => {});
		await msg.edit({ components: removeRows(msg) }).catch(() => {});
		await msg.react("✅").catch(() => {});
		return;
	}

	// ===================== ✅/❌ после COPY_TEXT (в логе) =====================
	if (
		interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE) ||
		interaction.customId.startsWith(CUSTOM_IDS.DECLINE_HIVE)
	) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		await interaction.deferUpdate();

		const isAccept = interaction.customId.startsWith(CUSTOM_IDS.ACCEPT_HIVE);
		const hiveIdStr = interaction.customId.replace(
			isAccept ? CUSTOM_IDS.ACCEPT_HIVE : CUSTOM_IDS.DECLINE_HIVE,
			"",
		);

		const hiveId = BigInt(hiveIdStr);
		const msg = interaction.message;

		if (!isAccept) {
			await prisma.hive.update({
				where: { id: hiveId },
				data: { status: "REJECTED" },
			}).catch(() => {});

			await msg.reactions.removeAll().catch(() => {});
			await msg.edit({ components: removeRows(msg) }).catch(() => {});
			await msg.react("❌").catch(() => {});
			return;
		}

		// ✅ ACCEPT: получаем улику из БД
		const hive = await prisma.hive.findUnique({
			where: { id: hiveId },
			include: { organisation: true },
		});

		if (!hive) {
			await interaction.followUp({ content: "❌ Улика не найдена в БД.", ephemeral: true }).catch(() => {});
			return;
		}

		// logUrl уже должен быть сохранён при отправке в лог (из личного канала),
		// но на всякий — fallback на msg.url
		const logUrl = hive.logUrl ?? msg.url;

		// REQUIRED => сразу 1/4 (без выбора)
		if (String(hive.type).toUpperCase() === "REQUIRED") {
			await prisma.hive.update({
				where: { id: hiveId },
				data: { status: "ACCEPTED", form: "ONE_QUARTER", logUrl },
			}).catch(() => {});

			const res = await postHiveToForum({
				guild: interaction.guild,
				hiveIdStr,
			});

			if (!res.ok) {
				await interaction.followUp({
					content: `⚠️ Не удалось обновить сводку: ${res.reason}`,
					ephemeral: true,
				}).catch(() => {});
			}

			await msg.reactions.removeAll().catch(() => {});
			await msg.edit({ components: removeRows(msg) }).catch(() => {});
			await msg.react("✅").catch(() => {});
			return;
		}

		// OPTIONAL => показываем выбор 1/2 и 1/5
		await prisma.hive.update({
			where: { id: hiveId },
			data: { status: "ACCEPTED", logUrl }, // форму поставим по кнопке
		}).catch(() => {});

		const formRow = buildFormButtons(hiveIdStr);

		await msg.edit({
			components: [...removeRows(msg), formRow],
		}).catch(() => {});

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

	// ===================== ПРИНЯТЬ (в личном канале заявки) =====================
	if (interaction.customId.startsWith(CUSTOM_IDS.ACCEPT)) {
		const member = interaction.member as GuildMember;
		if (!isStaff(member)) {
			return interaction.reply({ content: "❌ У вас нет прав.", ephemeral: true });
		}

		await interaction.deferReply({ ephemeral: true });
		await interaction.editReply("⏳ Принимаю улику, подожди...").catch(() => {});

		const hiveIdStr = interaction.customId.replace(CUSTOM_IDS.ACCEPT, "");
		const hiveId = BigInt(hiveIdStr);

		const hive = await prisma.hive.findUnique({
			where: { id: hiveId },
			include: { organisation: true },
		});
		if (!hive) return interaction.editReply("❌ Улика не найдена.").catch(() => {});

		await prisma.hive.update({
			where: { id: hiveId },
			data: { status: "ACCEPTED" },
		}).catch(() => {});

		const appMessage = interaction.message;
		const originalEmbed = appMessage.embeds[0];
		if (!originalEmbed) return interaction.editReply("❌ Embed не найден.").catch(() => {});

		const moderator = interaction.user;

		const resultEmbed = EmbedBuilder.from(originalEmbed)
			.setColor("Green")
			.addFields({ name: "✅ Принял", value: `<@${moderator.id}>`, inline: true })
			.setFooter({ text: "by Evri" })
			.setTimestamp();

		// отправка в лог + ✅ СОХРАНЕНИЕ logUrl В БД
		const logChannel = interaction.guild?.channels.cache.get(config.DB_LOG_CHANNEL_ID);

		if (logChannel?.isTextBased()) {
			const copyBtn = createButton({
				customId: `${CUSTOM_IDS.COPY_TEXT}${hiveIdStr}`,
				label: "📋 Скопировать текст",
				style: ButtonStyle.Secondary,
			});
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(copyBtn);

			const sent = await logChannel.send({ embeds: [resultEmbed], components: [row] }).catch(() => null);

			if (sent) {
				await prisma.hive.update({
					where: { id: hiveId },
					data: { logUrl: sent.url }, // ✅ сохраняем ссылку
				}).catch(() => {});
			}
		}

		await interaction.followUp({
			content: "✅ Улика принята и отправлена в лог.",
			ephemeral: true,
		}).catch(async () => {
			await interaction.editReply("✅ Улика принята и отправлена в лог.").catch(() => {});
		});

		// удаляем заявку
		await appMessage.delete().catch(() => {});

		// и чистить канал (после ответа!)
		const appChannel = appMessage.channel;

		if (appChannel?.isTextBased()) {
			// берём побольше, чтобы не промахнуться
			const messages = await appChannel.messages.fetch({ limit: 100 }).catch(() => null);

			if (messages) {
				// ищем любые сообщения с embed'ом "Улика" (мягкая проверка)
				const hasAnyHiveMessage = messages.some((m: Message) => {
					const e = m.embeds?.[0];
					const title = (e?.title || "").toLowerCase();
					return title.includes("улика"); // ✅ не строгое равенство
				});

				// если улик больше нет — тогда удаляем канал
				if (!hasAnyHiveMessage) {
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