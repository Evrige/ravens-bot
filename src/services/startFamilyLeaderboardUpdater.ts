import { Client } from "discord.js";
import { updateFamilyLeaderboardPanel } from "./updateFamilyLeaderboardPanel";

export function startFamilyLeaderboardUpdater(client: Client) {
	updateFamilyLeaderboardPanel(client).catch((error) => {
		console.warn("[family-leaderboard] initial update failed:", error);
	});

	setInterval(() => {
		updateFamilyLeaderboardPanel(client).catch((error) => {
			console.warn("[family-leaderboard] update failed:", error);
		});
	}, 5 * 60 * 1000);
}
