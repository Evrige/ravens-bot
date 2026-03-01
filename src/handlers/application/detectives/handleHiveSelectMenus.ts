import { StringSelectMenuInteraction } from "discord.js";
import {CUSTOM_IDS} from "../../../constants/customIds";
import {openDBApplicationModal} from "./openDBApplicationModal";

export async function handleHiveSelectMenus(interaction: StringSelectMenuInteraction) {
	if (!interaction.isStringSelectMenu()) return;

	if (
		interaction.customId === CUSTOM_IDS.HIVE_SELECT_FAMILY ||
		interaction.customId === CUSTOM_IDS.HIVE_SELECT_FRACTION
	) {
		const orgId = interaction.values[0];
		// Главное: НЕ interaction.update(), иначе сообщение будет меняться всем
		return openDBApplicationModal(interaction, undefined, undefined, orgId);
	}
}