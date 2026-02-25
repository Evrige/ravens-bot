import { Guild } from "discord.js";
import {config} from "../config/env";


interface LogOptions {
	guild: Guild;
	message: string;
}

export async function sendLog({ guild, message }: LogOptions) {
	try {
		const logChannel = await guild.channels.fetch(config.FAMILY_LOG_CHANNEL_ID);
		if (!logChannel?.isTextBased()) return;
		await logChannel.send({ content: message });
	} catch (err) {
		console.error("Ошибка при отправке лога:", err);
	}
}