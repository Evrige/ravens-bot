import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import * as dotenv from "dotenv";
import 'dotenv/config';

// Импорт команд
import { hiveCommand } from "./commands/detectives/application";
import { familyCommand } from "./commands/ravens-family/application";

dotenv.config();

// Создаем клиента
const client = new Client({
	intents: [GatewayIntentBits.Guilds],
	partials: [Partials.Channel]
});

// Команды
const commands = [familyCommand.data.toJSON()];
const hiveCommands = [hiveCommand.data.toJSON()];

// Настройка серверов и команд для каждого
const serversCommands = [
	{
		guildId: "784348300810780683", // Тестовый сервер
		commands: [...commands, ...hiveCommands] // объединяем все команды
	},
	// Можно добавить другие сервера:
	// {
	//     guildId: "ID_другого_сервера",
	//     commands: [...другие_команды]
	// }
];

client.once("ready", async () => {
	console.log(`Бот запущен как ${client.user?.tag}`);

	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

	// Регистрируем команды на всех серверах
	for (const { guildId, commands } of serversCommands) {
		try {
			await rest.put(
				Routes.applicationGuildCommands(client.user!.id, guildId),
				{ body: commands }
			);
			console.log(`Команды успешно зарегистрированы на сервере ${guildId}`);
		} catch (error) {
			console.error(`Ошибка при регистрации команд на сервере ${guildId}:`, error);
		}
	}
});

// Обработка взаимодействий
import { handleInteractions } from "./handlers/interactionHandler";
client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

// Логинимся
client.login(process.env.TOKEN);