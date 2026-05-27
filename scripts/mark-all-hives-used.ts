import "dotenv/config";
import { prisma } from "../src/utils/prisma";

async function main() {
	const result = await prisma.hive.updateMany({
		where: {
			isUsed: false,
		},
		data: {
			isUsed: true,
		},
	});

	console.log(`Marked ${result.count} hives as used`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
