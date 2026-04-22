import { Client } from "discord.js";
import { refreshAllGiveaways } from "./giveawayService";

export function startGiveawayWatcher(client: Client) {
	refreshAllGiveaways(client).catch((error) => {
		console.warn("[giveaway] initial refresh failed:", error);
	});

	setInterval(() => {
		refreshAllGiveaways(client).catch((error) => {
			console.warn("[giveaway] refresh tick failed:", error);
		});
	}, 15_000);
}
