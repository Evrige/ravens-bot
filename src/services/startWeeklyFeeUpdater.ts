import {updateWeeklyFeePanel} from "./updateWeeklyFeePanel";
import {Client} from "discord.js";

export function startWeeklyFeeUpdater(client: Client) {
	setInterval(() => {
		updateWeeklyFeePanel(client);
	}, 24 * 60 * 60 * 1000); // раз в день
}