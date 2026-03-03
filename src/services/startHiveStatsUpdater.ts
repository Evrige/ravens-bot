import { Client } from "discord.js";
import { updateHiveStats } from "./updateHiveStats";

export function startHiveStatsUpdater(client: Client) {
	updateHiveStats(client); // ✅ канал берётся из BotMessage
	setInterval(() => {
		updateHiveStats(client);
	}, 12 * 60 * 60 * 1000);
}