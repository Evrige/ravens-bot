import {
	Interaction,
} from "discord.js";
import 'dotenv/config';
import {CUSTOM_COMMAND} from "../constants/customIds";
import {handleDBButtons} from "./application/detectives/handleDBButtons";
import {hiveCommand} from "../commands/detectives/application";
import {familyCommand} from "../commands/ravens-family/application";
import {handleDBSubmit} from "./application/detectives/handleDBSubmit";
import {handleFamilyButtons} from "./application/ravens-family/handleFamilyButtons";
import {handleFamilySubmit} from "./application/ravens-family/handleFamilySubmit";
import {recruitStatsCommand} from "../commands/ravens-family/recruit-stats";
import {staffListCommand} from "../commands/ravens-family/staff-list";

export async function handleInteractions(interaction: Interaction) {

	// ================= SLASH =================
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.DB_APPLICATION) {
			return hiveCommand.execute(interaction);
		}
	}
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.FAMILY_APPLICATION) {
			return familyCommand.execute(interaction);
		}
	}

	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.RECRUIT_STATS) {
			return recruitStatsCommand.execute(interaction);
		}
	}
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === CUSTOM_COMMAND.STAFF_LIST) {
			return staffListCommand.execute(interaction);
		}
	}

	if (interaction.isButton()) {
		await handleDBButtons(interaction)
		await handleFamilyButtons(interaction)
	}
	if (interaction.isModalSubmit()) {
		await handleDBSubmit(interaction)
		await handleFamilySubmit(interaction)
	}
}
