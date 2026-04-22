import { Client } from "discord.js";
import { updateFamilyEventsPanel } from "./updateFamilyEventsPanel";

export function startFamilyEventsPanelUpdater(client: Client) {
	updateFamilyEventsPanel(client).catch(console.error);
	setInterval(() => {
		updateFamilyEventsPanel(client).catch(console.error);
	}, 60_000);
}
