import {
	Client,
	GatewayIntentBits,
	Partials,
	REST,
	Routes
} from "discord.js";
import * as dotenv from "dotenv";
import "dotenv/config";

// ==== Импорт команд ====
import { familyCommand } from "./commands/ravens-family/application";
import { hiveCommand } from "./commands/detectives/application";

// ==== Импорт обработчиков ====
import { handleInteractions } from "./handlers/interactionHandler";
import { startRecruitStatsUpdater } from "./services/recruitStatsUpdater";
import {recruitStatsCommand} from "./commands/ravens-family/recruit-stats";
import {staffListCommand} from "./commands/ravens-family/staff-list";
import {syncMembers} from "./utils/syncMembers";
import {config} from "./config/env";

dotenv.config();

// ==== Создание клиента ====
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
	],
	partials: [Partials.Channel]
});

// =======================================================
// Команды для разных серверов
// =======================================================

const familyCommands = [
	familyCommand.data.toJSON(),
	recruitStatsCommand.data.toJSON(),
	staffListCommand.data.toJSON()
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

	// Запуск автообновления статистики
	startRecruitStatsUpdater(client);
});

client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.login(process.env.TOKEN);