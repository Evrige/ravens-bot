import { Client } from "discord.js";
import { upsertFactionRolesAdminPanel } from "./upsertFactionRolesAdminPanel";
import { upsertFactionRolesPanel } from "./upsertFactionRolesPanel";

export function startFactionRolesUpdater(client: Client) {
	upsertFactionRolesPanel(client).catch(() => null);
	upsertFactionRolesAdminPanel(client).catch(() => null);
	setInterval(() => {
		upsertFactionRolesPanel(client).catch(() => null);
		upsertFactionRolesAdminPanel(client).catch(() => null);
	}, 12 * 60 * 60 * 1000);
}
