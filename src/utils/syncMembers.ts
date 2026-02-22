import { Client } from "discord.js";
import {prisma} from "./prisma";

export async function syncMembers(client: Client, guildId: string) {
	const guild = await client.guilds.fetch(guildId);

	console.log("🔄 Загружаем участников...");
	await guild.members.fetch();

	const members = guild.members.cache;

	const data = members.map(member => ({
		id: member.id,
	}));

	console.log(`👥 Найдено участников: ${data.length}`);

	await prisma.user.createMany({
		data,
		skipDuplicates: true,
	});

	console.log("✅ Синхронизация завершена");
}