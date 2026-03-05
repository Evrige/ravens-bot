import { REST, Routes } from "discord.js";
import "dotenv/config";

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

async function clear() {
	const appId = "1472999771940720680";
	const familyGuild = process.env.FAMILY_SERVER_GUID!;
	const dbGuild = process.env.DB_SERVER_GUID!;

	await rest.put(Routes.applicationGuildCommands(appId, familyGuild), { body: [] });
	console.log(`✅ Команды удалены на FAMILY сервере (${familyGuild})`);

	await rest.put(Routes.applicationGuildCommands(appId, dbGuild), { body: [] });
	console.log(`✅ Команды удалены на DB сервере (${dbGuild})`);
}

clear().catch((e) => {
	console.error(e);
	process.exit(1);
});