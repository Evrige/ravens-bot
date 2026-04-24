import { Client } from "discord.js";
import { upsertFamilyGamesAdminPanel } from "./upsertFamilyGamesAdminPanel";
import { upsertFamilyGamesPanel } from "./upsertFamilyGamesPanel";

export function startFamilyGamesUpdater(client: Client) {
	upsertFamilyGamesPanel(client).catch(() => null);
	upsertFamilyGamesAdminPanel(client).catch(() => null);
	setInterval(() => {
		upsertFamilyGamesPanel(client).catch(() => null);
		upsertFamilyGamesAdminPanel(client).catch(() => null);
	}, 12 * 60 * 60 * 1000);
}
