import { REST, Routes } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
	const token = process.env.TOKEN;
	const clientId = process.env.CLIENT_ID;
	const familyGuildId = process.env.FAMILY_SERVER_GUID;
	const dbGuildId = process.env.DB_SERVER_GUID;

	if (!token) throw new Error("TOKEN is not set in .env");
	if (!clientId) throw new Error("CLIENT_ID is not set in .env");

	const rest = new REST({ version: "10" }).setToken(token);

	const guilds = [familyGuildId, dbGuildId].filter(Boolean) as string[];

	if (!guilds.length) {
		throw new Error("No guild ids found in .env");
	}

	for (const guildId of guilds) {
		try {
			await rest.put(
				Routes.applicationGuildCommands(clientId, guildId),
				{ body: [] }
			);

			console.log(`✅ Все guild-команды удалены с сервера ${guildId}`);
		} catch (error) {
			console.error(`❌ Ошибка при очистке команд на сервере ${guildId}:`, error);
		}
	}

	console.log("🏁 Готово. Все серверные команды очищены.");
}

main().catch((error) => {
	console.error("❌ Fatal error:", error);
	process.exit(1);
});