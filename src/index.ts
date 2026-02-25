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
import {startStaffListUpdater} from "./services/startStaffListUpdater";
import {
	banCommand,
	muteCommand,
	unbanCommand, unmuteCommand,
	unwarnCommand,
	warnCommand
} from "./commands/ravens-family/moderation-command";

dotenv.config();

// ==== Создание клиента ====
export const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
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
];

const hiveCommands = [
	hiveCommand.data.toJSON()
];

// const serversCommands = [
// 	{
// 		guildId: process.env.FAMILY_SERVER_GUID!,
// 		commands: familyCommands
// 	},
// 	{
// 		guildId: process.env.FAMILY_SERVER_GUID!,
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

	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

	// Регистрация команд по серверам
	for (const { guildId, commands } of serversCommands) {
		try {
			await rest.put(
				Routes.applicationGuildCommands(client.user!.id, guildId),
				{ body: commands }
			);
			await syncMembers(client, config.FAMILY_SERVER_GUID)
			console.log(`✅ Команды зарегистрированы на сервере ${guildId}`);
		} catch (error) {
			console.error(
				`❌ Ошибка регистрации команд на сервере ${guildId}:`,
				error
			);
		}
	}
	await startRecruitStatsUpdater();
	await startStaffListUpdater();
});



client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.login(process.env.TOKEN);