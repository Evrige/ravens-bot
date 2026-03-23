import {
	ActionRowBuilder,
	EmbedBuilder,
	StringSelectMenuBuilder,
} from "discord.js";
import {prisma} from "../../../utils/prisma";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {getColorEmoji} from "../../../utils/detectives/orgColors";

function buildOrgSelect(customId: string, placeholder: string, orgs: Array<{ id: bigint; name: string; color: string }>) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(customId)
		.setPlaceholder(placeholder)
		.addOptions(
			orgs.slice(0, 25).map(o => ({
				label: o.name.slice(0, 100),
				value: o.id.toString(),
				emoji: { name: getColorEmoji(o.color) },
			}))
		);

	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export async function buildHivePanelMessage() {
	const [families, fractions] = await Promise.all([
		prisma.organisation.findMany({
			where: { type: "FAMILY", isFreeze: false },
			orderBy: { name: "asc" },
		}),
		prisma.organisation.findMany({
			where: { type: "FRACTION", isFreeze: false },
			orderBy: { name: "asc" },
		}),
	]);

	const embed = new EmbedBuilder()
		.setTitle("🧾 Подача улики")
		.setDescription("Выбери организацию в одном из селектов ниже — откроется форма.");

	const components = [];
	if (families.length)
		components.push(
			buildOrgSelect(
				CUSTOM_IDS.HIVE_SELECT_FAMILY,
				"🏠 FAMILY — выбери семью",
				families as any
			)
		);

	if (fractions.length)
		components.push(
			buildOrgSelect(
				CUSTOM_IDS.HIVE_SELECT_FRACTION,
				"🛡️ FRACTION — выбери фракцию",
				fractions as any
			)
		);

	return { embeds: [embed], components };
}