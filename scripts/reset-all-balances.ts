import "dotenv/config";
import { prisma } from "../src/utils/prisma";

async function main() {
	const result = await prisma.user.updateMany({
		data: {
			balance: 0 as any,
		},
	});

	console.log(`Balances reset for ${result.count} users.`);
}

main()
	.catch((error) => {
		console.error("Failed to reset balances:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect().catch(() => {});
	});
