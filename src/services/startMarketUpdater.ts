import {updateMarket} from "./updateMarket";
import {Client} from "discord.js";

export function startMarketUpdater(client: Client) {
	updateMarket(client).catch(() => null);
	setInterval(() => {
		updateMarket(client).catch(() => null);
	}, 12 * 60 * 60 * 1000);
}
