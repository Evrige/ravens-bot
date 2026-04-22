import { Client } from "discord.js";
import { updateMarketOrdersPanel } from "./updateMarketOrdersPanel";

export function startMarketOrdersPanelUpdater(client: Client) {
	updateMarketOrdersPanel(client).catch((error) => {
		console.error("[market-orders-panel] initial update failed:", error);
	});

	setInterval(() => {
		updateMarketOrdersPanel(client).catch((error) => {
			console.error("[market-orders-panel] periodic update failed:", error);
		});
	}, 5 * 60 * 1000);
}
