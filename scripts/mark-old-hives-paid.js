"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/utils/prisma");
async function main() {
    const result = await prisma_1.prisma.hive.updateMany({
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
    await prisma_1.prisma.$disconnect();
});
