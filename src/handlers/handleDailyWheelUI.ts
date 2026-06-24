import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonInteraction,
	EmbedBuilder,
	GuildMember,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { FAMILY_HIGH_ROLE_IDS, FAMILY_OWNERS_ROLE_IDS } from "../config/staff";
import { CUSTOM_IDS } from "../constants/customIds";
import {
	DailyWheelCooldownError,
	DailyWheelInsufficientBalanceError,
	DailyWheelSpinMode,
	fulfillDailyWheelSpin,
	sendDailyWheelLog,
	spinDailyWheel,
} from "../services/dailyWheelService";
import {
	upsertDailyWheelAdminPanel,
	upsertDailyWheelPanels,
} from "../services/upsertDailyWheelPanels";
import { prisma } from "../utils/prisma";
import {
	DAILY_WHEEL_GIF_SPIN_MS,
	getRewardCenterAngle,
} from "../utils/renderDailyWheel";
import { enqueueDailyWheelGif } from "../services/dailyWheelGifQueue";

type WheelInteraction = ButtonInteraction | ModalSubmitInteraction;

function canManage(interaction: WheelInteraction) {
	const member = interaction.member as GuildMember | null;
	if (!member) return false;

	return [...FAMILY_OWNERS_ROLE_IDS, ...FAMILY_HIGH_ROLE_IDS].some(
		(roleId) => roleId && member.roles.cache.has(roleId)
	);
}

function shortInput(
	customId: string,
	label: string,
	placeholder: string,
	required = true
) {
	return new TextInputBuilder()
		.setCustomId(customId)
		.setLabel(label)
		.setPlaceholder(placeholder)
		.setStyle(TextInputStyle.Short)
		.setRequired(required);
}

async function showAddRewardModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.DAILY_WHEEL_MODAL_ADD)
		.setTitle("Добавить награду")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_NAME,
					"Название награды",
					"Например: 500 монет или VIP на 7 дней"
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_CHANCE,
					"Шанс в процентах",
					"Например: 12.5"
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_TYPE,
					"Тип: coins или manual",
					"coins = автовыдача, manual = вручную"
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_AMOUNT,
					"Количество монет",
					"Обязательно только для типа coins",
					false
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_IMAGE,
					"Ссылка на картинку (необязательно)",
					"https://example.com/prize.png",
					false
				)
			)
		);

	await interaction.showModal(modal);
}

function normalizeImageUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return null;

	try {
		const url = new URL(trimmed);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.toString();
	} catch {
		return null;
	}
}

async function showRewardImageModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.DAILY_WHEEL_MODAL_IMAGE)
		.setTitle("Картинка награды")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_ID,
					"ID награды из таблицы",
					"Например: 3"
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_IMAGE,
					"Ссылка или remove для удаления",
					"https://example.com/prize.png"
				)
			)
		);

	await interaction.showModal(modal);
}

async function showPaidPriceModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.DAILY_WHEEL_MODAL_PRICE)
		.setTitle("Цена платного вращения")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_PAID_PRICE,
					"Цена в монетах",
					"Например: 500"
				)
			)
		);

	await interaction.showModal(modal);
}

async function showDeleteRewardModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.DAILY_WHEEL_MODAL_DELETE)
		.setTitle("Удалить награду")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_ID,
					"ID награды из таблицы",
					"Например: 3"
				)
			)
		);

	await interaction.showModal(modal);
}

async function showEditRewardModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId(CUSTOM_IDS.DAILY_WHEEL_MODAL_EDIT)
		.setTitle("Редактировать награду")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_ID,
					"ID награды из таблицы",
					"Например: 3"
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_NAME,
					"Новое название (необязательно)",
					"Оставьте пустым, чтобы не менять",
					false
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_CHANCE,
					"Новый шанс (необязательно)",
					"Например: 12.5",
					false
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_TYPE,
					"Новый тип (необязательно)",
					"coins или manual",
					false
				)
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				shortInput(
					CUSTOM_IDS.DAILY_WHEEL_REWARD_AMOUNT,
					"Новое количество монет",
					"Для типа coins",
					false
				)
			)
		);

	await interaction.showModal(modal);
}

async function handleAddReward(interaction: ModalSubmitInteraction) {
	const name = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_NAME)
		.trim()
		.slice(0, 80);
	const chanceRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_CHANCE)
		.trim()
		.replace(",", ".");
	const rewardType = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_TYPE)
		.trim()
		.toUpperCase();
	const amountRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_AMOUNT)
		.trim();
	const imageRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_IMAGE)
		.trim();

	const chance = Number(chanceRaw);
	const amount = amountRaw ? Number(amountRaw) : null;
	const imageUrl = imageRaw ? normalizeImageUrl(imageRaw) : null;

	if (!name) {
		await interaction.reply({
			content: "❌ Название награды не может быть пустым.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!Number.isFinite(chance) || chance <= 0 || chance > 100) {
		await interaction.reply({
			content: "❌ Шанс должен быть числом больше 0 и не больше 100.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (rewardType !== "COINS" && rewardType !== "MANUAL") {
		await interaction.reply({
			content: "❌ Тип должен быть `coins` или `manual`.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (
		rewardType === "COINS" &&
		(!Number.isSafeInteger(amount) || (amount ?? 0) <= 0)
	) {
		await interaction.reply({
			content: "❌ Для типа `coins` укажите целое количество монет больше 0.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (imageRaw && !imageUrl) {
		await interaction.reply({
			content: "❌ Укажите корректную ссылку на картинку с `http://` или `https://`.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const aggregate = await prisma.dailyWheelReward.aggregate({
		_sum: { chance: true },
	});
	const currentTotal = aggregate._sum.chance ?? 0;

	if (currentTotal + chance > 100.000001) {
		await interaction.editReply(
			`❌ Нельзя добавить: сумма шансов станет **${(currentTotal + chance).toFixed(2)}%**. Максимум 100%.`
		);
		return;
	}

	await prisma.dailyWheelReward.create({
		data: {
			name,
			chance,
			rewardType,
			amount: rewardType === "COINS" ? amount : null,
			imageUrl,
		},
	});

	await upsertDailyWheelAdminPanel(interaction.client);
	await interaction.editReply(`✅ Награда **${name}** добавлена с шансом **${chance}%**.`);
}

async function handleDeleteReward(interaction: ModalSubmitInteraction) {
	const id = Number(
		interaction.fields
			.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_ID)
			.trim()
	);

	if (!Number.isSafeInteger(id) || id <= 0) {
		await interaction.reply({
			content: "❌ Укажите корректный ID награды.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const reward = await prisma.dailyWheelReward.findUnique({ where: { id } });
	if (!reward) {
		await interaction.editReply("❌ Награда с таким ID не найдена.");
		return;
	}

	await prisma.dailyWheelReward.delete({ where: { id } });
	await upsertDailyWheelAdminPanel(interaction.client);
	await interaction.editReply(`✅ Награда **${reward.name}** удалена.`);
}

async function handleRewardImage(interaction: ModalSubmitInteraction) {
	const id = Number(
		interaction.fields.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_ID).trim()
	);
	const imageRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_IMAGE)
		.trim();

	if (!Number.isSafeInteger(id) || id <= 0) {
		await interaction.reply({
			content: "❌ Укажите корректный ID награды.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const removeImage = imageRaw.toLowerCase() === "remove" || imageRaw === "-";
	const imageUrl = removeImage ? null : normalizeImageUrl(imageRaw);

	if (!removeImage && !imageUrl) {
		await interaction.reply({
			content: "❌ Укажите корректную ссылку или слово `remove` для удаления картинки.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const reward = await prisma.dailyWheelReward.findUnique({ where: { id } });
	if (!reward) {
		await interaction.editReply("❌ Награда с таким ID не найдена.");
		return;
	}

	await prisma.dailyWheelReward.update({
		where: { id },
		data: { imageUrl },
	});
	await upsertDailyWheelAdminPanel(interaction.client);
	await interaction.editReply(
		removeImage
			? `✅ Картинка награды **${reward.name}** удалена.`
			: `✅ Картинка награды **${reward.name}** обновлена.`
	);
}

async function handlePaidPrice(interaction: ModalSubmitInteraction) {
	const price = Number(
		interaction.fields.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_PAID_PRICE).trim()
	);

	if (!Number.isSafeInteger(price) || price <= 0 || price > 1_000_000_000) {
		await interaction.reply({
			content: "❌ Цена должна быть целым числом от 1 до 1 000 000 000.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await prisma.dailyWheelSettings.upsert({
		where: { id: 1 },
		update: { paidSpinPrice: price },
		create: { id: 1, paidSpinPrice: price },
	});
	await upsertDailyWheelPanels(interaction.client);
	await interaction.editReply(
		`✅ Цена платного вращения установлена: **${price.toLocaleString("ru-RU")} монет**.`
	);
}

async function handleEditReward(interaction: ModalSubmitInteraction) {
	const id = Number(
		interaction.fields.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_ID).trim()
	);
	if (!Number.isSafeInteger(id) || id <= 0) {
		await interaction.reply({
			content: "❌ Укажите корректный ID награды.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const nameRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_NAME)
		.trim();
	const chanceRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_CHANCE)
		.trim()
		.replace(",", ".");
	const typeRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_TYPE)
		.trim()
		.toUpperCase();
	const amountRaw = interaction.fields
		.getTextInputValue(CUSTOM_IDS.DAILY_WHEEL_REWARD_AMOUNT)
		.trim();

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const reward = await prisma.dailyWheelReward.findUnique({ where: { id } });
	if (!reward) {
		await interaction.editReply("❌ Награда с таким ID не найдена.");
		return;
	}

	const nextName = nameRaw ? nameRaw.slice(0, 80) : reward.name;
	const nextChance = chanceRaw ? Number(chanceRaw) : reward.chance;
	const nextType = typeRaw || reward.rewardType;
	const nextAmount = amountRaw ? Number(amountRaw) : reward.amount;

	if (!Number.isFinite(nextChance) || nextChance <= 0 || nextChance > 100) {
		await interaction.editReply("❌ Шанс должен быть числом больше 0 и не больше 100.");
		return;
	}

	if (nextType !== "COINS" && nextType !== "MANUAL") {
		await interaction.editReply("❌ Тип должен быть `coins` или `manual`.");
		return;
	}

	if (
		nextType === "COINS" &&
		(!Number.isSafeInteger(nextAmount) || (nextAmount ?? 0) <= 0)
	) {
		await interaction.editReply("❌ Для типа `coins` укажите целое количество монет больше 0.");
		return;
	}

	const aggregate = await prisma.dailyWheelReward.aggregate({
		where: { id: { not: id } },
		_sum: { chance: true },
	});
	const totalWithoutCurrent = aggregate._sum.chance ?? 0;

	if (totalWithoutCurrent + nextChance > 100.000001) {
		await interaction.editReply(
			`❌ Нельзя сохранить: сумма шансов станет **${(totalWithoutCurrent + nextChance).toFixed(2)}%**.`
		);
		return;
	}

	await prisma.dailyWheelReward.update({
		where: { id },
		data: {
			name: nextName,
			chance: nextChance,
			rewardType: nextType,
			amount: nextType === "COINS" ? nextAmount : null,
		},
	});

	await upsertDailyWheelAdminPanel(interaction.client);
	await interaction.editReply(`✅ Награда ID **${id}** обновлена.`);
}

async function animateSpin(
	interaction: ButtonInteraction,
	spinMode: DailyWheelSpinMode
) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	let result;
	try {
		result = await spinDailyWheel(interaction.user.id, spinMode);
	} catch (error) {
		if (error instanceof DailyWheelCooldownError) {
			const timestamp = Math.floor(error.nextSpinAt.getTime() / 1000);
			await interaction.editReply(
				`⏳ Колесо ещё восстанавливается. Следующее вращение доступно <t:${timestamp}:R> — <t:${timestamp}:f>.`
			);
			return;
		}
		if (error instanceof DailyWheelInsufficientBalanceError) {
			await interaction.editReply(
				`❌ Недостаточно монет. Платное вращение стоит **${error.price.toLocaleString("ru-RU")} монет**.`
			);
			return;
		}

		const message =
			error instanceof Error && error.message === "DAILY_WHEEL_NO_REWARDS"
				? "❌ В колесе пока нет наград."
				: error instanceof Error && error.message === "DAILY_WHEEL_INVALID_CHANCES"
					? "❌ Настройки колеса некорректны: сумма шансов больше 100%."
					: "❌ Не удалось запустить колесо. Попробуйте позже.";
		await interaction.editReply(message);
		console.error("[daily-wheel] spin failed:", error);
		return;
	}

	const rewardCenter = getRewardCenterAngle(
		result.visualRewards,
		result.reward.id
	);
	const targetRotation =
		Math.PI * 2 * 7 + (-Math.PI / 2 - rewardCenter);
	await interaction.editReply("🎡 Подготавливаем колесо...");

	const animation = await enqueueDailyWheelGif({
		rewards: result.visualRewards,
		targetRotation,
		result: result.reward,
	});
	const attachment = new AttachmentBuilder(animation, {
		name: `daily-wheel-${result.spinId.toString()}.gif`,
	});
	const content =
		result.reward.rewardType === "COINS"
			? `🎉 Вы выиграли **${result.reward.amount?.toLocaleString("ru-RU")} монет**! Награда уже начислена.`
			: result.reward.rewardType === "MANUAL"
				? `🎉 Вы выиграли **${result.reward.name}**! Заявка на выдачу отправлена администрации.`
				: "Сегодня колесо остановилось на секторе **Без выигрыша**. Завтра повезёт больше!";

	await interaction.editReply({
		content: "🎡 Колесо вращается...",
		attachments: [],
		files: [attachment],
	});

	await new Promise((resolve) => setTimeout(resolve, DAILY_WHEEL_GIF_SPIN_MS));
	await interaction.editReply({ content });

	await sendDailyWheelLog(
		interaction.client,
		result,
		interaction.user.id
	);

	const dmEmbed = new EmbedBuilder()
		.setColor(
			result.reward.rewardType === "NONE"
				? 0x6b7280
				: result.reward.rewardType === "MANUAL"
					? 0xf59e0b
					: 0x57f287
		)
		.setTitle("🎡 Результат колеса Londo")
		.setDescription(content)
		.addFields({
			name: "Тип вращения",
			value:
				result.spinMode === "PAID"
					? `Платное — ${result.spinPrice?.toLocaleString("ru-RU") ?? 0} монет`
					: "Бесплатное",
			inline: true,
		})
		.setTimestamp();

	await interaction.user.send({ embeds: [dmEmbed] }).catch(() => {});
}

async function handleFulfill(interaction: ButtonInteraction) {
	if (!canManage(interaction)) {
		await interaction.reply({
			content: "❌ У вас нет прав для подтверждения выдачи.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const spinIdRaw = interaction.customId.slice(CUSTOM_IDS.DAILY_WHEEL_FULFILL.length);
	let spinId: bigint;
	try {
		spinId = BigInt(spinIdRaw);
	} catch {
		await interaction.reply({
			content: "❌ Некорректный ID вращения.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const updated = await fulfillDailyWheelSpin(spinId, interaction.user.id);
	if (!updated.count) {
		await interaction.reply({
			content: "ℹ️ Награда уже выдана или запись не найдена.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const embed = interaction.message.embeds[0]
		? EmbedBuilder.from(interaction.message.embeds[0])
		: new EmbedBuilder().setTitle("🎁 Ручная награда колеса");
	const fields = (embed.data.fields ?? []).filter((field) => field.name !== "Статус");
	embed.setFields(
		...fields,
		{
			name: "Статус",
			value: `✅ Выдано <@${interaction.user.id}>`,
			inline: true,
		}
	).setColor(0x57f287);

	await interaction.update({
		embeds: [embed],
		components: [],
	});
}

export async function handleDailyWheelUI(interaction: WheelInteraction) {
	const customId = interaction.customId;
	const isKnown =
		customId === CUSTOM_IDS.DAILY_WHEEL_SPIN ||
		customId === CUSTOM_IDS.DAILY_WHEEL_PAID_SPIN ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_ADD ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_EDIT ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_IMAGE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_PRICE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_DELETE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_ADD ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_EDIT ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_IMAGE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_PRICE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_DELETE ||
		customId.startsWith(CUSTOM_IDS.DAILY_WHEEL_FULFILL);

	if (!isKnown) return false;

	if (interaction.isButton() && customId === CUSTOM_IDS.DAILY_WHEEL_SPIN) {
		await animateSpin(interaction, "FREE");
		return true;
	}

	if (interaction.isButton() && customId === CUSTOM_IDS.DAILY_WHEEL_PAID_SPIN) {
		await animateSpin(interaction, "PAID");
		return true;
	}

	if (
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_ADD ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_EDIT ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_IMAGE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_PRICE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_DELETE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_ADD ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_EDIT ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_IMAGE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_PRICE ||
		customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_DELETE
	) {
		if (!canManage(interaction)) {
			await interaction.reply({
				content: "❌ У вас нет прав для управления колесом.",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}
	}

	if (interaction.isButton()) {
		if (customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_ADD) {
			await showAddRewardModal(interaction);
		}
		if (customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_EDIT) {
			await showEditRewardModal(interaction);
		}
		if (customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_IMAGE) {
			await showRewardImageModal(interaction);
		}
		if (customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_PRICE) {
			await showPaidPriceModal(interaction);
		}
		if (customId === CUSTOM_IDS.DAILY_WHEEL_ADMIN_DELETE) {
			await showDeleteRewardModal(interaction);
		}
		if (customId.startsWith(CUSTOM_IDS.DAILY_WHEEL_FULFILL)) {
			await handleFulfill(interaction);
		}
		return true;
	}

	if (customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_ADD) {
		await handleAddReward(interaction);
	}
	if (customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_EDIT) {
		await handleEditReward(interaction);
	}
	if (customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_IMAGE) {
		await handleRewardImage(interaction);
	}
	if (customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_PRICE) {
		await handlePaidPrice(interaction);
	}
	if (customId === CUSTOM_IDS.DAILY_WHEEL_MODAL_DELETE) {
		await handleDeleteReward(interaction);
	}
	return true;
}
