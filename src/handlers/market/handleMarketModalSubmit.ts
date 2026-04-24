import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import { prisma } from "../../utils/prisma";
import { CUSTOM_IDS } from "../../constants/customIds";
import { FAMILY_OWNERS_ROLE_IDS } from "../../config/staff";
import { updateMarket } from "../../services/updateMarket";
import { upsertMarketAdminPanel } from "../../services/upsertMarketAdminPanel";

function hasMarketManageAccess(interaction: ModalSubmitInteraction) {
	const roleCache = (interaction.member as any)?.roles?.cache;
	if (!roleCache) return false;

	return FAMILY_OWNERS_ROLE_IDS.some((roleId) => roleCache.has(roleId));
}

function parsePrice(raw: string) {
	const price = Number(raw.trim());
	return Number.isFinite(price) && price > 0 ? price : null;
}

export async function handleMarketModalSubmit(
	interaction: ModalSubmitInteraction
) {
	const isAdd = interaction.customId === CUSTOM_IDS.MARKET_MODAL_ADD;
	const isEdit = interaction.customId.startsWith(CUSTOM_IDS.MARKET_MODAL_EDIT_ITEM);

	if (!isAdd && !isEdit) return;

	if (!hasMarketManageAccess(interaction)) {
		await interaction.reply({
			content: "❌ Управлять товарами могут только владельцы.",
			flags: MessageFlags.Ephemeral,
		}).catch(() => {});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

	if (isAdd) {
		const name = interaction.fields.getTextInputValue(CUSTOM_IDS.MARKET_MODAL_NAME).trim();
		const price = parsePrice(interaction.fields.getTextInputValue(CUSTOM_IDS.MARKET_MODAL_PRICE));

		if (!name || !price) {
			await interaction.editReply("❌ Укажи корректные название и цену.");
			return;
		}

		const item = await prisma.market.create({
			data: { name, price },
		});

		await updateMarket(interaction.client).catch(() => {});
		await upsertMarketAdminPanel(interaction.client).catch(() => {});
		await interaction.editReply(`✅ Товар **${item.name}** добавлен.`);
		return;
	}

	const itemIdRaw = interaction.customId.slice(CUSTOM_IDS.MARKET_MODAL_EDIT_ITEM.length);
	let itemId: bigint;
	try {
		itemId = BigInt(itemIdRaw);
	} catch {
		await interaction.editReply("❌ Некорректный ID товара.");
		return;
	}

	const item = await prisma.market.findUnique({ where: { id: itemId } });
	if (!item) {
		await interaction.editReply("❌ Товар не найден.");
		return;
	}

	const name = interaction.fields.getTextInputValue(CUSTOM_IDS.MARKET_MODAL_NAME).trim();
	const price = parsePrice(interaction.fields.getTextInputValue(CUSTOM_IDS.MARKET_MODAL_PRICE));

	if (!name) {
		await interaction.editReply("❌ Название не может быть пустым.");
		return;
	}

	if (name.toUpperCase() === "DELETE") {
		await prisma.$transaction([
			prisma.selling.deleteMany({ where: { marketId: itemId } }),
			prisma.market.delete({ where: { id: itemId } }),
		]);

		await updateMarket(interaction.client).catch(() => {});
		await upsertMarketAdminPanel(interaction.client).catch(() => {});
		await interaction.editReply(`✅ Товар **${item.name}** удалён.`);
		return;
	}

	if (!price) {
		await interaction.editReply("❌ Укажи корректную цену.");
		return;
	}

	await prisma.market.update({
		where: { id: itemId },
		data: { name, price },
	});

	await updateMarket(interaction.client).catch(() => {});
	await upsertMarketAdminPanel(interaction.client).catch(() => {});
	await interaction.editReply(`✅ Товар **#${itemId.toString()}** обновлён.`);
}
