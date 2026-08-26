import { Client } from "discord.js";
import {prisma} from "./prisma";

const BATCH_SIZE = 100;

export async function syncMembers(client: Client, guildId: string) {
	const guild = await client.guilds.fetch(guildId);

	console.log("🔄 Загружаем участников...");
	await guild.members.fetch();

	const members = guild.members.cache;
	const ids = Array.from(members.keys());

	console.log(`👥 Найдено участников: ${ids.length}`);

	for (let index = 0; index < ids.length; index += BATCH_SIZE) {
		const batch = ids.slice(index, index + BATCH_SIZE);
		await prisma.user.createMany({
			data: batch.map((id) => ({ id })),
			skipDuplicates: true,
		});
	}

	console.log("✅ Синхронизация завершена");
}
