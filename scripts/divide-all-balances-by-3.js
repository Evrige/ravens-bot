"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/utils/prisma");
async function main() {
    const affected = await prisma_1.prisma.$executeRawUnsafe('UPDATE "User" SET "balance" = "balance" / 3');
    console.log(`Balances divided by 3 for ${affected} users.`);
}
main()
    .catch((error) => {
    console.error("Failed to divide balances by 3:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect().catch(() => { });
});
