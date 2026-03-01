import { ModalSubmitInteraction } from "discord.js";
import { handleRolePurchase } from "./handleRolePurchase";
import {CUSTOM_IDS} from "../../constants/customIds";

export async function handleMarketModalSubmit(
	interaction: ModalSubmitInteraction
) {
	if (!interaction.customId.startsWith(CUSTOM_IDS.ROLE_BUY)) return;

	await handleRolePurchase(interaction);
}