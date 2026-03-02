import { Interaction } from "discord.js";
import "dotenv/config";
import { CUSTOM_COMMAND } from "../constants/customIds";

import { handleDBButtons } from "./application/detectives/handleDBButtons";
import { handleDBSubmit } from "./application/detectives/handleDBSubmit";

import { handleFamilyButtons } from "./application/ravens-family/handleFamilyButtons";
import { handleFamilySubmit } from "./application/ravens-family/handleFamilySubmit";

import { hiveCommand } from "../commands/detectives/application";
import { familyCommand } from "../commands/ravens-family/application";
import { recruitStatsCommand } from "../commands/ravens-family/recruit-stats";
import { staffListCommand } from "../commands/ravens-family/staff-list";
import {
	banCommand, muteCommand, unbanCommand, unmuteCommand, unwarnCommand, warnCommand
} from "../commands/ravens-family/moderation-command";
import { voiceTopCommand } from "../commands/ravens-family/voiceTop";
import { streamerAddCommand } from "../commands/ravens-family/streamer-add";
import { streamerRemoveCommand } from "../commands/ravens-family/streamer-remove";
import { balanceCheckCommand, balanceCommand, giveCommand, takeCommand } from "../commands/ravens-family/balanceKeeper";
import { handleMarketButtons } from "./market/handleMarketButtons";
import { marketAddCommand, marketCommand } from "../commands/ravens-family/market";
import { handleMarketModalSubmit } from "./market/handleMarketModalSubmit";
import { profileCommand } from "../commands/ravens-family/profile";
import { handleStaffListToggle } from "../services/updateStaffList";
import { client } from "../index";
import {handleHiveSelectMenus} from "./application/detectives/handleHiveSelectMenus";
import {organisationAddCommand} from "../commands/detectives/organisation-add";
import {handleHiveDeclineReasonSubmit} from "./application/detectives/handleHiveDeclineReasonSubmit";
import {handleFamilyEditModal, handleFamilyListPanelButtons} from "./application/detectives/familyListPanelHandler";

// ================== Словарь команд ==================
const commandsMap: Record<string, any> = {
	[CUSTOM_COMMAND.DB_APPLICATION]: hiveCommand,
	[CUSTOM_COMMAND.FAMILY_APPLICATION]: familyCommand,
	[CUSTOM_COMMAND.MUTE]: muteCommand,
	[CUSTOM_COMMAND.UNMUTE]: unmuteCommand,
	[CUSTOM_COMMAND.BAN]: banCommand,
	[CUSTOM_COMMAND.UNBAN]: unbanCommand,
	[CUSTOM_COMMAND.WARN]: warnCommand,
	[CUSTOM_COMMAND.UNWARN]: unwarnCommand,
	[CUSTOM_COMMAND.VOICETOP]: voiceTopCommand,
	[CUSTOM_COMMAND.STAFF_LIST]: staffListCommand,
	[CUSTOM_COMMAND.RECRUIT_STATS]: recruitStatsCommand,
	[CUSTOM_COMMAND.STREAMER_ADD]: streamerAddCommand,
	[CUSTOM_COMMAND.STREAMER_REMOVE]: streamerRemoveCommand,
	[CUSTOM_COMMAND.BALANCE]: balanceCommand,
	[CUSTOM_COMMAND.BALANCE_GIVE]: giveCommand,
	[CUSTOM_COMMAND.BALANCE_TAKE]: takeCommand,
	[CUSTOM_COMMAND.BALANCE_CHECK]: balanceCheckCommand,
	[CUSTOM_COMMAND.MARKET]: marketCommand,
	[CUSTOM_COMMAND.MARKET_ADD]: marketAddCommand,
	[CUSTOM_COMMAND.PROFILE]: profileCommand,
	[CUSTOM_COMMAND.DB_ORGANISATION_ADD]: organisationAddCommand,
};

// ================== Обработчик интеракций ==================
export async function handleInteractions(interaction: Interaction) {
	try {
		if (interaction.isChatInputCommand()) {
			const command = commandsMap[interaction.commandName];
			if (!command) return;
			return command.execute(interaction);
		}

		if (interaction.isStringSelectMenu()) {
			await handleHiveSelectMenus(interaction);
			return;
		}

		if (interaction.isButton()) {
			await handleDBButtons(interaction);
			await handleFamilyButtons(interaction);
			await handleMarketButtons(interaction);
			await handleFamilyListPanelButtons(interaction);
			if (interaction.customId.startsWith("staff_toggle:")) {
				const handled = await handleStaffListToggle(client, interaction);
				if (handled) return;
			}
			return;
		}

		if (interaction.isModalSubmit()) {
			await handleDBSubmit(interaction);
			await handleFamilySubmit(interaction);
			await handleMarketModalSubmit(interaction);
			await handleHiveDeclineReasonSubmit(interaction);
			await handleFamilyEditModal(interaction);
			return;
		}
	} catch (e) {
		console.error("[interactionHandler] error:", e);
		if (interaction.isRepliable()) {
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: "❌ Ошибка при обработке интеракции.", ephemeral: true }).catch(() => {});
			}
		}
	}
}