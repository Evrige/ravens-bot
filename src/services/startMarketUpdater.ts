import {updateMarket} from "./updateMarket";
import {Client} from "discord.js";

export function startMarketUpdater(client: Client) {
	updateMarket(client); // 👉 сразу создаёт / обновляет маркет
	setInterval(() => {
		updateMarket(client); // 👉 потом обновляет каждые 12 часов
	}, 12 * 60 * 60 * 1000);
}