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
import {marketAddCommand, marketCommand} from "./commands/ravens-family/market";
import {profileCommand} from "./commands/ravens-family/profile";
import {initMessageTracker} from "./services/messageTracker";
import {startStaffListUpdater} from "./services/startStaffListUpdater";
import {initTempVoice} from "./tempvoice/tempVoice";
import {organisationAddCommand} from "./commands/detectives/organisation-add";
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
	partials: [Partials.Channel]
});

// =======================================================
// Команды для разных серверов
// =======================================================

const familyCommands = [
	familyCommand.data.toJSON(),
	recruitStatsCommand.data.toJSON(),
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
	marketAddCommand.data.toJSON(),
	profileCommand.data.toJSON(),
];

const hiveCommands = [
	hiveCommand.data.toJSON(),
	organisationAddCommand.data.toJSON(),
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
	startStaffListUpdater(client);
	initVoiceTracker(client);
	initMessageTracker(client);
	initTempVoice(client);
	await startRecruitStatsUpdater();
});



client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.login(process.env.TOKEN);
