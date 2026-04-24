import { Client } from "discord.js";
import { expireVacations } from "./familyVacationService";

export function startFamilyVacationWatcher(client: Client) {
	expireVacations(client).catch((error) => {
		console.error("[family-vacation] initial expire failed:", error);
	});

	setInterval(() => {
		expireVacations(client).catch((error) => {
			console.error("[family-vacation] periodic expire failed:", error);
		});
	}, 60 * 1000);
}
