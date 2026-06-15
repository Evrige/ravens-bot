import "dotenv/config";
import { prisma } from "../src/utils/prisma";

async function main() {
	const shouldDelete = process.argv.includes("--confirm");

	const families = await prisma.organisation.findMany({
		where: { type: "FAMILY" },
		select: { id: true, name: true },
		orderBy: { id: "asc" },
	});

	if (families.length === 0) {
		console.log("No FAMILY organisations found.");
		return;
	}

	const familyIds = families.map((family) => family.id);

	if (!shouldDelete) {
		const [caseHives, hives, cases] = await Promise.all([
			prisma.caseHive.count({
				where: {
					Hive: {
						organisationId: { in: familyIds },
					},
				},
			}),
			prisma.hive.count({
				where: {
					organisationId: { in: familyIds },
				},
			}),
			prisma.case.count({
				where: {
					orgId: { in: familyIds },
				},
			}),
		]);

		console.log("Dry run only. Nothing was deleted.");
		console.log(`Found ${families.length} FAMILY organisations.`);
		console.log(`Found ${hives} related hives.`);
		console.log(`Found ${caseHives} case-hive links.`);
		console.log(`Found ${cases} related cases.`);
		console.log("Run with --confirm to delete them.");
		return;
	}

	const result = await prisma.$transaction(async (tx) => {
		const caseHives = await tx.caseHive.deleteMany({
			where: {
				Hive: {
					organisationId: { in: familyIds },
				},
			},
		});

		const hives = await tx.hive.deleteMany({
			where: {
				organisationId: { in: familyIds },
			},
		});

		const cases = await tx.case.deleteMany({
			where: {
				orgId: { in: familyIds },
			},
		});

		const organisations = await tx.organisation.deleteMany({
			where: {
				id: { in: familyIds },
				type: "FAMILY",
			},
		});

		return {
			caseHives: caseHives.count,
			hives: hives.count,
			cases: cases.count,
			organisations: organisations.count,
		};
	});

	console.log(`Deleted ${result.organisations} FAMILY organisations.`);
	console.log(`Deleted ${result.hives} related hives.`);
	console.log(`Deleted ${result.caseHives} case-hive links.`);
	console.log(`Deleted ${result.cases} related cases.`);
}

main()
	.catch((error) => {
		console.error("Failed to delete FAMILY organisations:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect().catch(() => {});
	});
