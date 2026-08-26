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
import {upsertFactionListPanel} from "./services/upsertFactionListPanel";
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
import { upsertFamilyMediaPanel, upsertFamilyPromoPanel } from "./services/upsertFamilyPromoPanel";
import { autoDeclineFamilyApplicationsForUserLeave } from "./handlers/application/ravens-family/processFamilyApplication";
import { initFamilyInterviewVoiceTracker } from "./services/familyInterviewVoiceTracker";
import { coinflipCommand } from "./commands/ravens-family/coinflip";
import { restoreCoinflipChallenges } from "./handlers/handleCoinflipUI";
import { diceCommand } from "./commands/ravens-family/dice";
import { restoreDiceChallenges } from "./handlers/handleDiceUI";
import { startFactionRolesUpdater } from "./services/startFactionRolesUpdater";
import { upsertFactionRolesPanel } from "./services/upsertFactionRolesPanel";
import { upsertFactionRolesAdminPanel } from "./services/upsertFactionRolesAdminPanel";
import { refreshExistingHiveForumSummaries } from "./handlers/application/detectives/postHiveToOrgForum";
import {
	flushBotLogQueue,
	initBotLogger,
	installBotConsoleBridge,
	logBotEvent,
} from "./services/botLogger";
import { upsertStreamerPanel } from "./services/upsertStreamerPanel";
import { upsertDailyWheelPanels } from "./services/upsertDailyWheelPanels";
import { dailyWheelResetCommand } from "./commands/ravens-family/daily-wheel-reset";
import { startDailyWheelCooldownNotifier } from "./services/startDailyWheelCooldownNotifier";
dotenv.config();
installBotConsoleBridge();

process.on("unhandledRejection", (error) => {
	console.error("[process] unhandled rejection:", error);
	logBotEvent({
		level: "error",
		title: "Unhandled rejection",
		description: "Поймана необработанная ошибка Promise.",
		error,
	});
});

process.on("uncaughtException", (error) => {
	console.error("[process] uncaught exception:", error);
	logBotEvent({
		level: "error",
		title: "Uncaught exception",
		description: "Поймана критическая необработанная ошибка процесса.",
		error,
	});
});

async function runStartupTask(name: string, task: () => unknown | Promise<unknown>) {
	try {
		await task();
	} catch (error) {
		console.error(`[startup] ${name} failed:`, error);
		logBotEvent({
			level: "error",
			title: "Startup task failed",
			description: `Задача запуска **${name}** завершилась ошибкой.`,
			error,
			fields: [{ name: "Task", value: name, inline: true }],
		});
	}
}

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
initBotLogger(client);

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
	dailyWheelResetCommand.data.toJSON(),
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

const serversCommands = [
	{
		guildId: process.env.FAMILY_SERVER_GUID!,
		commands: familyCommands
	},
	{
		guildId: process.env.DB_SERVER_GUID!,
		commands: hiveCommands
	}
];
// const serversCommands = [
// 	{
// 		guildId: process.env.FAMILY_SERVER_GUID!,
// 		commands: [...familyCommands, ...hiveCommands]
// 	}
// ];
// =======================================================
// Ready
// =======================================================

client.once("ready", async () => {
	console.log(`Бот запущен как ${client.user?.tag}`);
	logBotEvent({
		level: "success",
		title: "Бот запускается",
		description: `Бот вошёл в Discord как **${client.user?.tag ?? "unknown"}**.`,
		fields: [
			{ name: "Servers", value: String(client.guilds.cache.size), inline: true },
			{ name: "Node", value: process.version, inline: true },
		],
	});
	await flushBotLogQueue();
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
			logBotEvent({
				level: "success",
				title: "Команды зарегистрированы",
				description: `Slash-команды обновлены на сервере \`${guildId}\`.`,
				fields: [{ name: "Команд", value: String(commands.length), inline: true }],
			});
		} catch (error) {
			console.error(`❌ Ошибка регистрации команд на сервере ${guildId}:`, error);
			logBotEvent({
				level: "error",
				title: "Ошибка регистрации команд",
				description: `Не удалось зарегистрировать slash-команды на сервере \`${guildId}\`.`,
				error,
			});
		}
	}

	// 2) Синхроним участников ОДИН раз (и только нужный сервер)
	try {
		await syncMembers(client, config.FAMILY_SERVER_GUID);
		console.log("✅ syncMembers завершён");
		logBotEvent({
			level: "success",
			title: "Синхронизация участников завершена",
			description: "Участники сервера синхронизированы с базой.",
		});
	} catch (e) {
		console.error("❌ syncMembers error:", e);
		logBotEvent({
			level: "error",
			title: "Ошибка syncMembers",
			description: "Не удалось синхронизировать участников сервера.",
			error: e,
		});
	}

	// остальное
	await runStartupTask("startMarketUpdater", () => startMarketUpdater(client));
	await runStartupTask("startTwitchChecker", () => startTwitchChecker(client));
	await runStartupTask("startWeeklyFeeUpdater", () => startWeeklyFeeUpdater(client));
	await runStartupTask("startHiveStatsUpdater", () => startHiveStatsUpdater(client));
	await runStartupTask("startStaffListUpdater", () => startStaffListUpdater(client));
	await runStartupTask("startOrganisationsPanelUpdater", () => startOrganisationsPanelUpdater(client));
	await runStartupTask("startEventNotifications", () => startEventNotifications(client));
	await runStartupTask("startFamilyEventsPanelUpdater", () => startFamilyEventsPanelUpdater(client));
	await runStartupTask("startFamilyLeaderboardUpdater", () => startFamilyLeaderboardUpdater(client));
	await runStartupTask("startGiveawayWatcher", () => startGiveawayWatcher(client));
	await runStartupTask("startFamilyAuditLogger", () => startFamilyAuditLogger(client));
	await runStartupTask("startFamilyWelcomeNotifier", () => startFamilyWelcomeNotifier(client));
	await runStartupTask("startFamilyAfkWatcher", () => startFamilyAfkWatcher(client));
	await runStartupTask("startFamilyVacationWatcher", () => startFamilyVacationWatcher(client));
	await runStartupTask("startMarketOrdersPanelUpdater", () => startMarketOrdersPanelUpdater(client));
	await runStartupTask("startFamilyGamesUpdater", () => startFamilyGamesUpdater(client));
	await runStartupTask("startFactionRolesUpdater", () => startFactionRolesUpdater(client));
	await runStartupTask("startDailyWheelCooldownNotifier", () => startDailyWheelCooldownNotifier(client));
	await runStartupTask("initVoiceTracker", () => initVoiceTracker(client));
	await runStartupTask("initFamilyInterviewVoiceTracker", () => initFamilyInterviewVoiceTracker(client));
	await runStartupTask("initMessageTracker", () => initMessageTracker(client));
	await runStartupTask("initTempVoice", () => initTempVoice(client));
	await runStartupTask("upsertFamilyListPanel", () => upsertFamilyListPanel(client));
	await runStartupTask("upsertFactionListPanel", () => upsertFactionListPanel(client));
	await runStartupTask("upsertFamilyAfkPanel", () => upsertFamilyAfkPanel(client));
	await runStartupTask("upsertFamilyVacationPanel", () => upsertFamilyVacationPanel(client));
	await runStartupTask("upsertGiveawayPanel", () => upsertGiveawayPanel(client));
	await runStartupTask("upsertFamilyGamesPanel", () => upsertFamilyGamesPanel(client));
	await runStartupTask("upsertFamilyGamesAdminPanel", () => upsertFamilyGamesAdminPanel(client));
	await runStartupTask("upsertFactionRolesPanel", () => upsertFactionRolesPanel(client));
	await runStartupTask("upsertFactionRolesAdminPanel", () => upsertFactionRolesAdminPanel(client));
	await runStartupTask("upsertStreamerPanel", () => upsertStreamerPanel(client));
	await runStartupTask("upsertDailyWheelPanels", () => upsertDailyWheelPanels(client));
	await runStartupTask("refreshExistingHiveForumSummaries", () => refreshExistingHiveForumSummaries(client));
	await runStartupTask("upsertFamilyImprovementPanels", () => upsertFamilyImprovementPanels(client));
	await runStartupTask("upsertFamilyPromoPanel", () => upsertFamilyPromoPanel(client));
	await runStartupTask("upsertFamilyMediaPanel", () => upsertFamilyMediaPanel(client));
	await runStartupTask("restoreCoinflipChallenges", () => restoreCoinflipChallenges(client));
	await runStartupTask("restoreDiceChallenges", () => restoreDiceChallenges(client));
	await runStartupTask("startRecruitStatsUpdater", () => startRecruitStatsUpdater());
	logBotEvent({
		level: "success",
		title: "Бот полностью запущен",
		description: "Все startup-задачи выполнены. Бот готов принимать команды и кнопки.",
	});
});



client.on("interactionCreate", async (interaction) => {
	try {
		await handleInteractions(interaction);
	} catch (error) {
		console.error("[interactionCreate] handler failed:", error);
		logBotEvent({
			level: "error",
			title: "Interaction handler failed",
			description: "Главный обработчик Discord-интеракции завершился ошибкой.",
			error,
			fields: [
				{ name: "Type", value: String(interaction.type), inline: true },
				{
					name: "ID",
					value: "customId" in interaction ? String((interaction as any).customId ?? "-") : "-",
					inline: false,
				},
			],
		});
	}
});

client.on("guildMemberRemove", async (member) => {
	try {
		if (member.guild.id !== config.FAMILY_SERVER_GUID) return;
		await autoDeclineFamilyApplicationsForUserLeave(member.guild, member.id);
	} catch (error) {
		console.error("[guildMemberRemove] handler failed:", error);
		logBotEvent({
			level: "error",
			title: "guildMemberRemove failed",
			description: `Ошибка при обработке выхода участника <@${member.id}>.`,
			error,
		});
	}
});

client.login(process.env.TOKEN).catch((error) => {
	console.error("[startup] client login failed:", error);
	logBotEvent({
		level: "error",
		title: "Discord login failed",
		description: "Бот не смог войти в Discord. Проверь TOKEN и доступ к Discord.",
		error,
	});
});
