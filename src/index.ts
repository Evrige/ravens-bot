import {Client, GatewayIntentBits, Partials, REST, Routes} from "discord.js";
import * as dotenv from "dotenv";
import {hiveCommand} from "./commands/detectives/application";
import {handleInteractions} from "./handlers/interactionHandler";
import 'dotenv/config';
import {familyCommand} from "./commands/ravens-family/application";
dotenv.config();

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
	partials: [Partials.Channel]
});
const commands = [familyCommand.data.toJSON()];
const hiveCommands = [hiveCommand.data.toJSON()];

client.once("ready", async () => {
	console.log(`Бот запущен как ${client.user?.tag}`);

	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

	// Регистрация команд глобально
	await rest.put(
		Routes.applicationGuildCommands(client.user!.id, "784348300810780683"),
		{ body: commands }
	);
	await rest.put(
		Routes.applicationGuildCommands(client.user!.id, "784348300810780683"),
		{ body: hiveCommands }
	);
});

client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.login(process.env.TOKEN);