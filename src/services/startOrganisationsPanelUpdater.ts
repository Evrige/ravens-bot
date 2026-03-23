import { Client } from "discord.js";
import { updateOrganisationsPanel } from "./updateOrganisationsPanel";

const DAY_MS = 24 * 60 * 60 * 1000;

let started = false;

export function startOrganisationsPanelUpdater(client: Client) {
	if (started) return;
	started = true;

	setInterval(async () => {
		try {
			await updateOrganisationsPanel(client);
		} catch (err) {
			console.error("startOrganisationsPanelUpdater error:", err);
		}
	}, DAY_MS);
}