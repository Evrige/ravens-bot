import { Client } from "discord.js";
import { expireAfk } from "./familyAfkService";

export function startFamilyAfkWatcher(client: Client) {
	expireAfk(client).catch((error) => {
		console.error("[family-afk] initial expire failed:", error);
	});

	setInterval(() => {
		expireAfk(client).catch((error) => {
			console.error("[family-afk] periodic expire failed:", error);
		});
	}, 60 * 1000);
}
