"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/utils/prisma");
async function main() {
    const result = await prisma_1.prisma.user.updateMany({
        data: {
            balance: 0,
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
    await prisma_1.prisma.$disconnect().catch(() => { });
});
