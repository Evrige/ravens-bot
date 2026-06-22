import { Interaction, MessageFlags } from "discord.js";
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
	banCommand,
	muteCommand,
	unbanCommand,
	unmuteCommand,
	unwarnCommand,
	warnCommand,
} from "../commands/ravens-family/moderation-command";
import { voiceTopCommand } from "../commands/ravens-family/voiceTop";
import { streamerAddCommand } from "../commands/ravens-family/streamer-add";
import { streamerRemoveCommand } from "../commands/ravens-family/streamer-remove";
import {
	balanceCheckCommand,
	balanceCommand,
	giveCommand,
	takeCommand,
} from "../commands/ravens-family/balanceKeeper";
import { handleMarketButtons } from "./market/handleMarketButtons";
import { marketCommand } from "../commands/ravens-family/market";
import { handleMarketModalSubmit } from "./market/handleMarketModalSubmit";
import { profileCommand } from "../commands/ravens-family/profile";
import { handleStaffListToggle } from "../services/updateStaffList";
import { client } from "../index";
import { handleHiveSelectMenus } from "./application/detectives/handleHiveSelectMenus";
import { organisationAddCommand } from "../commands/detectives/organisation-add";
import { handleHiveDeclineReasonSubmit } from "./application/detectives/handleHiveDeclineReasonSubmit";
import {
	handleFamilyEditModal,
	handleFamilyListPanelButtons,
} from "./application/detectives/familyListPanelHandler";
import {
	handleCaseButtons,
	handleCaseReplaceModal,
	handleCreateCaseButton,
	handleCreateCaseModal,
	handleDeleteHiveFromForumButton,
	handleDeleteHiveFromForumModal,
} from "./cases/handleCases";
import { hiveStatsCommand } from "../commands/detectives/hive-stats";
import { handleWeeklyFeeUI } from "./handleWeeklyFeeUI";
import { weeklyFeeAddCommand } from "../commands/ravens-family/weekly-fee-add";
import { weeklyFeePanelCommand } from "../commands/ravens-family/weekly-fee-panel";
import { weeklyFeeRemoveCommand } from "../commands/ravens-family/weekly-fee-remove";
import { familyPanelReset } from "../commands/detectives/familyPanelReset";
import { recruitCommand } from "../commands/ravens-family/recruit";
import { hivePayoutCommand } from "../commands/detectives/hive-payout";
import {internshipCommand} from "../commands/detectives/internship";
import {organisationsListCommand} from "../commands/detectives/organisations-list";
import {navigationPanelCommand} from "../commands/ravens-family/navigation-panel";
import { handleFamilyAfkUI } from "./handleFamilyAfkUI";
import { giveawayCommand } from "../commands/ravens-family/giveaway";
import { handleGiveawayUI } from "./handleGiveawayUI";
import { handleFamilyImprovementUI } from "./handleFamilyImprovementUI";
import { gamesCommand } from "../commands/ravens-family/games";
import { handleFamilyGamesUI } from "./handleFamilyGamesUI";
import { handleFactionRolesUI } from "./handleFactionRolesUI";
import { handleFamilyVacationUI } from "./handleFamilyVacationUI";
import { rankCommand } from "../commands/ravens-family/rank";
import { recruitPerformanceCommand } from "../commands/ravens-family/recruit-performance";
import { handleFamilyPromoModal, handleFamilyPromoUI } from "./handleFamilyPromoUI";
import { coinflipCommand } from "../commands/ravens-family/coinflip";
import { handleCoinflipUI } from "./handleCoinflipUI";
import { diceCommand } from "../commands/ravens-family/dice";
import { handleDiceUI } from "./handleDiceUI";
import { logBotEvent } from "../services/botLogger";
import { handleStreamerPanelUI } from "./handleStreamerPanelUI";
import { handleDailyWheelUI } from "./handleDailyWheelUI";

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
	[CUSTOM_COMMAND.RECRUIT_PERFORMANCE]: recruitPerformanceCommand,
	[CUSTOM_COMMAND.STREAMER_ADD]: streamerAddCommand,
	[CUSTOM_COMMAND.STREAMER_REMOVE]: streamerRemoveCommand,
	[CUSTOM_COMMAND.BALANCE]: balanceCommand,
	[CUSTOM_COMMAND.BALANCE_GIVE]: giveCommand,
	[CUSTOM_COMMAND.BALANCE_TAKE]: takeCommand,
	[CUSTOM_COMMAND.BALANCE_CHECK]: balanceCheckCommand,
	[CUSTOM_COMMAND.MARKET]: marketCommand,
	[CUSTOM_COMMAND.PROFILE]: profileCommand,
	[CUSTOM_COMMAND.DB_ORGANISATION_ADD]: organisationAddCommand,
	[CUSTOM_COMMAND.DB_HIVE_STATS]: hiveStatsCommand,
	[CUSTOM_COMMAND.FEE_ADD]: weeklyFeeAddCommand,
	[CUSTOM_COMMAND.FEE_PANEL]: weeklyFeePanelCommand,
	[CUSTOM_COMMAND.FEE_REMOVE]: weeklyFeeRemoveCommand,
	[CUSTOM_COMMAND.FAMILY_PANEL]: familyPanelReset,
	[CUSTOM_COMMAND.RECRUIT]: recruitCommand,
	[CUSTOM_COMMAND.FAMILY_NAVIGATION]: navigationPanelCommand,
	[CUSTOM_COMMAND.GIVEAWAY]: giveawayCommand,
	[CUSTOM_COMMAND.COINFLIP]: coinflipCommand,
	[CUSTOM_COMMAND.DICE]: diceCommand,
	[CUSTOM_COMMAND.GAMES]: gamesCommand,
	[CUSTOM_COMMAND.RANK]: rankCommand,
	[CUSTOM_COMMAND.DB_HIVE_PAYOUT]: hivePayoutCommand,
	[CUSTOM_COMMAND.DB_INTERNSHIP]: internshipCommand,
	[CUSTOM_COMMAND.DB_ORGANISATIONS_LIST]: organisationsListCommand,
};

// ================== Обработчик интеракций ==================
export async function handleInteractions(interaction: Interaction) {
	try {
		if (interaction.isChatInputCommand()) {
			const command = commandsMap[interaction.commandName];
			if (!command) return;

			await command.execute(interaction);
			return;
		}

		if (interaction.isStringSelectMenu()) {
			if (await handleFamilyImprovementUI(interaction)) return;
			if (await handleGiveawayUI(interaction)) return;
			await handleHiveSelectMenus(interaction);
			return;
		}

		if (interaction.isButton()) {
			// Эти обработчики у тебя уже умеют возвращать boolean
			if (await handleDailyWheelUI(interaction)) return;
			if (await handleStreamerPanelUI(interaction)) return;
			if (await handleCreateCaseButton(interaction)) return;
			if (await handleDeleteHiveFromForumButton(interaction)) return;
			if (await handleFamilyListPanelButtons(interaction)) return;
			if (await handleDBButtons(interaction)) return;
			if (await handleFamilyAfkUI(interaction)) return;
			if (await handleFamilyVacationUI(interaction)) return;
			if (await handleFamilyImprovementUI(interaction)) return;
			if (await handleFamilyPromoUI(interaction)) return;
			if (await handleCoinflipUI(interaction)) return;
			if (await handleDiceUI(interaction)) return;
			if (await handleFamilyGamesUI(interaction)) return;
			if (await handleFactionRolesUI(interaction)) return;
			if (await handleGiveawayUI(interaction)) return;

			// Остальные вызываем как обычные функции
			await handleCaseButtons(interaction);
			await handleFamilyButtons(interaction);
			await handleMarketButtons(interaction);
			await handleWeeklyFeeUI(interaction);

			if (interaction.customId.startsWith("staff_toggle:")) {
				const handled = await handleStaffListToggle(client, interaction);
				if (handled) return;
			}

			return;
		}

		if (interaction.isModalSubmit()) {
			if (await handleDailyWheelUI(interaction)) return;
			if (await handleStreamerPanelUI(interaction)) return;
			if (await handleFamilyAfkUI(interaction)) return;
			if (await handleFamilyVacationUI(interaction)) return;
			if (await handleFamilyImprovementUI(interaction)) return;
			if (await handleFamilyPromoModal(interaction)) return;
			if (await handleFamilyGamesUI(interaction)) return;
			if (await handleFactionRolesUI(interaction)) return;
			if (await handleGiveawayUI(interaction)) return;
			await handleCreateCaseModal(interaction);
			if (await handleDeleteHiveFromForumModal(interaction)) return;
			await handleCaseReplaceModal(interaction);
			await handleDBSubmit(interaction);
			await handleFamilySubmit(interaction);
			await handleMarketModalSubmit(interaction);
			await handleHiveDeclineReasonSubmit(interaction);
			await handleFamilyEditModal(interaction);
			await handleWeeklyFeeUI(interaction);
			return;
		}
	} catch (e) {
		console.error("=== INTERACTION ERROR ===");
		console.error("interaction type:", interaction.type);

		if (interaction.isChatInputCommand()) {
			console.error("commandName:", interaction.commandName);
		}

		if (
			interaction.isButton() ||
			interaction.isModalSubmit() ||
			interaction.isStringSelectMenu()
		) {
			console.error("customId:", interaction.customId);
		}

		console.error(e);
		logBotEvent({
			level: "error",
			title: "Ошибка интеракции",
			description: "Один из обработчиков кнопки, модалки, меню или команды завершился ошибкой.",
			error: e,
			fields: [
				{
					name: "Тип",
					value: String(interaction.type),
					inline: true,
				},
				{
					name: "Команда",
					value: interaction.isChatInputCommand() ? interaction.commandName : "-",
					inline: true,
				},
				{
					name: "Custom ID",
					value:
						interaction.isButton() ||
						interaction.isModalSubmit() ||
						interaction.isStringSelectMenu()
							? interaction.customId
							: "-",
					inline: false,
				},
			],
		});

		if (interaction.isRepliable()) {
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "❌ Ошибка при обработке интеракции.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
			} else {
				await interaction.followUp({
					content: "❌ Ошибка при обработке интеракции.",
					flags: MessageFlags.Ephemeral,
				}).catch(() => {});
			}
		}
	}
}
