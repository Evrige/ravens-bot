"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/utils/prisma");
async function main() {
    const result = await prisma_1.prisma.hive.updateMany({
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
    await prisma_1.prisma.$disconnect();
});
