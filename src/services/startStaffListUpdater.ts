import { Client } from "discord.js";
import { updateStaffList } from "./updateStaffList";

export function startStaffListUpdater(client: Client) {
	updateStaffList(client); // ✅ сразу обновить (если уже создано)
	setInterval(() => {
		updateStaffList(client); // ✅ каждые 4 часа
	}, 4 * 60 * 60 * 1000);
}