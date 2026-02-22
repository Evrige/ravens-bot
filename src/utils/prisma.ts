import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Получение пользователя или создание, если его нет
export async function getOrCreateUser(discordId: string) {
	let user = await prisma.user.findUnique({ where: { id: discordId } });
	if (!user) {
		user = await prisma.user.create({ data: { id: discordId } });
	}
	return user;
}


export { prisma };