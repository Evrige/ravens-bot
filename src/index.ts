import {
	Client,
	GatewayIntentBits, NewsChannel,
	Partials,
	REST,
	Routes, TextBasedChannel, TextChannel, ThreadChannel
} from "discord.js";
import * as dotenv from "dotenv";
import "dotenv/config";
// ==== Импорт команд ====
import { familyCommand } from "./commands/ravens-family/application";
import { hiveCommand } from "./commands/detectives/application";

// ==== Импорт обработчиков ====
import { handleInteractions } from "./handlers/interactionHandler";
import {staffListCommand} from "./commands/ravens-family/staff-list";
import {syncMembers} from "./utils/syncMembers";
import {config} from "./config/env";
import {recruitStatsCommand} from "./commands/ravens-family/recruit-stats";
import {startRecruitStatsUpdater} from "./services/recruitStatsUpdater";
import {
	banCommand,
	muteCommand,
	unbanCommand, unmuteCommand,
	unwarnCommand,
	warnCommand
} from "./commands/ravens-family/moderation-command";
import {initVoiceTracker} from "./services/voiceChecker";
import {voiceTopCommand} from "./commands/ravens-family/voiceTop";
import {streamerAddCommand} from "./commands/ravens-family/streamer-add";
import { startWebServer } from "./web/server";
import {startTwitchChecker} from "./services/twitchChecker";
import {streamerRemoveCommand} from "./commands/ravens-family/streamer-remove";
import {balanceCheckCommand, balanceCommand, giveCommand, takeCommand} from "./commands/ravens-family/balanceKeeper";
import {startMarketUpdater} from "./services/startMarketUpdater";
import {marketCommand} from "./commands/ravens-family/market";
import {profileCommand} from "./commands/ravens-family/profile";
import {initMessageTracker} from "./services/messageTracker";
import {startStaffListUpdater} from "./services/startStaffListUpdater";
import {initTempVoice} from "./tempvoice/tempVoice";
import {organisationAddCommand} from "./commands/detectives/organisation-add";
import {upsertFamilyListPanel} from "./services/upsertFamilyListPanel";
import {hiveStatsCommand} from "./commands/detectives/hive-stats";
import {startHiveStatsUpdater} from "./services/startHiveStatsUpdater";
import {weeklyFeeAddCommand} from "./commands/ravens-family/weekly-fee-add";
import {weeklyFeePanelCommand} from "./commands/ravens-family/weekly-fee-panel";
import {startWeeklyFeeUpdater} from "./services/startWeeklyFeeUpdater";
import {weeklyFeeRemoveCommand} from "./commands/ravens-family/weekly-fee-remove";
import {familyPanelReset} from "./commands/detectives/familyPanelReset";
import {recruitCommand} from "./commands/ravens-family/recruit";
import {hivePayoutCommand} from "./commands/detectives/hive-payout";
import {internshipCommand} from "./commands/detectives/internship";
import {organisationsListCommand} from "./commands/detectives/organisations-list";
import {navigationPanelCommand} from "./commands/ravens-family/navigation-panel";
import {startOrganisationsPanelUpdater} from "./services/startOrganisationsPanelUpdater";
import {startEventNotifications} from "./services/startEventNotifications";
import {startFamilyAuditLogger} from "./services/startFamilyAuditLogger";
import {startFamilyWelcomeNotifier} from "./services/startFamilyWelcomeNotifier";
import {startFamilyEventsPanelUpdater} from "./services/startFamilyEventsPanelUpdater";
import {upsertFamilyAfkPanel} from "./services/upsertFamilyAfkPanel";
import { giveawayCommand } from "./commands/ravens-family/giveaway";
import { startGiveawayWatcher } from "./services/startGiveawayWatcher";
import { upsertGiveawayPanel } from "./services/upsertGiveawayPanel";
import { upsertFamilyImprovementPanels } from "./services/upsertFamilyImprovementPanels";
import { startFamilyLeaderboardUpdater } from "./services/startFamilyLeaderboardUpdater";
import { startFamilyAfkWatcher } from "./services/startFamilyAfkWatcher";
import { startMarketOrdersPanelUpdater } from "./services/startMarketOrdersPanelUpdater";
import { gamesCommand } from "./commands/ravens-family/games";
import { startFamilyGamesUpdater } from "./services/startFamilyGamesUpdater";
import { upsertFamilyGamesAdminPanel } from "./services/upsertFamilyGamesAdminPanel";
import { upsertFamilyGamesPanel } from "./services/upsertFamilyGamesPanel";
import { startFamilyVacationWatcher } from "./services/startFamilyVacationWatcher";
import { upsertFamilyVacationPanel } from "./services/upsertFamilyVacationPanel";
import { rankCommand } from "./commands/ravens-family/rank";
import { recruitPerformanceCommand } from "./commands/ravens-family/recruit-performance";
import { upsertFamilyPromoPanel } from "./services/upsertFamilyPromoPanel";
import { autoDeclineFamilyApplicationsForUserLeave } from "./handlers/application/ravens-family/processFamilyApplication";
import { initFamilyInterviewVoiceTracker } from "./services/familyInterviewVoiceTracker";
import { coinflipCommand } from "./commands/ravens-family/coinflip";
import { restoreCoinflipChallenges } from "./handlers/handleCoinflipUI";
import { diceCommand } from "./commands/ravens-family/dice";
import { restoreDiceChallenges } from "./handlers/handleDiceUI";
dotenv.config();

// ==== Создание клиента ====
export const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	],
	partials: [Partials.Message,
		Partials.Channel,
		Partials.GuildMember,
		Partials.User]
});

// =======================================================
// Команды для разных серверов
// =======================================================

const familyCommands = [
	familyCommand.data.toJSON(),
	recruitStatsCommand.data.toJSON(),
	recruitPerformanceCommand.data.toJSON(),
	staffListCommand.data.toJSON(),
	warnCommand.data.toJSON(),
	unwarnCommand.data.toJSON(),
	banCommand.data.toJSON(),
	unbanCommand.data.toJSON(),
	muteCommand.data.toJSON(),
	unmuteCommand.data.toJSON(),
	balanceCommand.data.toJSON(),
	voiceTopCommand.data.toJSON(),
	streamerAddCommand.data.toJSON(),
	streamerRemoveCommand.data.toJSON(),
	balanceCheckCommand.data.toJSON(),
	giveCommand.data.toJSON(),
	takeCommand.data.toJSON(),
	marketCommand.data.toJSON(),
	profileCommand.data.toJSON(),
	weeklyFeeAddCommand.data.toJSON(),
	weeklyFeePanelCommand.data.toJSON(),
	weeklyFeeRemoveCommand.data.toJSON(),
	recruitCommand.data.toJSON(),
	navigationPanelCommand.data.toJSON(),
	giveawayCommand.data.toJSON(),
	coinflipCommand.data.toJSON(),
	diceCommand.data.toJSON(),
	gamesCommand.data.toJSON(),
	rankCommand.data.toJSON(),
];

const hiveCommands = [
	hiveCommand.data.toJSON(),
	organisationAddCommand.data.toJSON(),
	hiveStatsCommand.data.toJSON(),
	familyPanelReset.data.toJSON(),
	hivePayoutCommand.data.toJSON(),
	internshipCommand.data.toJSON(),
	organisationsListCommand.data.toJSON(),
];

// const serversCommands = [
// 	{
// 		guildId: process.env.FAMILY_SERVER_GUID!,
// 		commands: familyCommands
// 	},
// 	{
// 		guildId: process.env.DB_SERVER_GUID!,
// 		commands: hiveCommands
// 	}
// ];
const serversCommands = [
	{
		guildId: process.env.FAMILY_SERVER_GUID!,
		commands: [...familyCommands, ...hiveCommands]
	}
];
// =======================================================
// Ready
// =======================================================

client.once("ready", async () => {
	console.log(`Бот запущен как ${client.user?.tag}`);
	startWebServer();
	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

	// 1) Регистрируем команды по серверам (без syncMembers внутри цикла)
	for (const { guildId, commands } of serversCommands) {
		try {
			await rest.put(
				Routes.applicationGuildCommands(client.user!.id, guildId),
				{ body: commands }
			);
			console.log(`✅ Команды зарегистрированы на сервере ${guildId}`);
		} catch (error) {
			console.error(`❌ Ошибка регистрации команд на сервере ${guildId}:`, error);
		}
	}

	// 2) Синхроним участников ОДИН раз (и только нужный сервер)
	try {
		await syncMembers(client, config.FAMILY_SERVER_GUID);
		console.log("✅ syncMembers завершён");
	} catch (e) {
		console.error("❌ syncMembers error:", e);
	}

	// остальное
	startMarketUpdater(client);
	startTwitchChecker(client);
	startWeeklyFeeUpdater(client);
	startHiveStatsUpdater(client)
	startStaffListUpdater(client);
	startOrganisationsPanelUpdater(client)
	startEventNotifications(client);
	startFamilyEventsPanelUpdater(client);
	startFamilyLeaderboardUpdater(client);
	startGiveawayWatcher(client);
	startFamilyAuditLogger(client);
	startFamilyWelcomeNotifier(client);
	startFamilyAfkWatcher(client);
	startFamilyVacationWatcher(client);
	startMarketOrdersPanelUpdater(client);
	startFamilyGamesUpdater(client);
	initVoiceTracker(client);
	initFamilyInterviewVoiceTracker(client);
	initMessageTracker(client);
	initTempVoice(client);
	await upsertFamilyListPanel(client);
	await upsertFamilyAfkPanel(client);
	await upsertFamilyVacationPanel(client);
	await upsertGiveawayPanel(client);
	await upsertFamilyGamesPanel(client);
	await upsertFamilyGamesAdminPanel(client);
	await upsertFamilyImprovementPanels(client);
	await upsertFamilyPromoPanel(client);
	await restoreCoinflipChallenges(client);
	await restoreDiceChallenges(client);
	await startRecruitStatsUpdater();
});



client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.on("guildMemberRemove", async (member) => {
	if (member.guild.id !== config.FAMILY_SERVER_GUID) return;
	await autoDeclineFamilyApplicationsForUserLeave(member.guild, member.id);
});

client.login(process.env.TOKEN);
