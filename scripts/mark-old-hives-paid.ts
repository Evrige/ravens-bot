import "dotenv/config";
import { prisma } from "../src/utils/prisma";

async function main() {
	const result = await prisma.hive.updateMany({
		data: {
			isPaid: true,
		},
	});

	console.log(`Updated ${result.count} hives`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});