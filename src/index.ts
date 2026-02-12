import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as dotenv from "dotenv";
import { registerApplicationCommand } from "./commands/application";
import {handleInteractions} from "./handlers/ interactionHandler";

dotenv.config();

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
	partials: [Partials.Channel]
});


client.once("ready", async () => {
	console.log(`Бот запущен как ${client.user?.tag}`);

	if (client.application) {
		await registerApplicationCommand(client);
	}
});

client.on("interactionCreate", async (interaction) => {
	await handleInteractions(interaction);
});

client.login(process.env.TOKEN);
