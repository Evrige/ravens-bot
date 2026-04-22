"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
const enums_1 = require("../src/generated/prisma/enums");
async function main() {
    console.log("🌱 Seeding organisations...");
    const families = [
        {
            name: "Ravens",
            subject: "Частная охранная деятельность",
            adress: "Los Santos, Vinewood",
            color: "#FF0000",
        },
        {
            name: "Black Syndicate",
            subject: "Импорт/экспорт товаров",
            adress: "Los Santos, Port",
            color: "#000000",
        },
        {
            name: "Golden Empire",
            subject: "Ювелирный бизнес",
            adress: "Rockford Hills",
            color: "#FFD700",
        },
        {
            name: "Night Wolves",
            subject: "Мотоклуб",
            adress: "Sandy Shores",
            color: "#2F4F4F",
        },
        {
            name: "Shadow Group",
            subject: "IT-компания",
            adress: "Downtown",
            color: "#4B0082",
        },
        {
            name: "Red Dragons",
            subject: "Ресторанный бизнес",
            adress: "Chinatown",
            color: "#8B0000",
        },
        {
            name: "White Lotus",
            subject: "Фармацевтика",
            adress: "Vespucci",
            color: "#FFFFFF",
        },
        {
            name: "Iron Brotherhood",
            subject: "Строительная компания",
            adress: "La Mesa",
            color: "#708090",
        },
        {
            name: "Blue Ocean",
            subject: "Логистика",
            adress: "Docklands",
            color: "#1E90FF",
        },
        {
            name: "Green Valley",
            subject: "Агробизнес",
            adress: "Paleto Bay",
            color: "#228B22",
        },
    ];
    for (const family of families) {
        await prisma_1.prisma.organisation.create({
            data: {
                ...family,
                type: enums_1.OrgType.FAMILY,
            },
        });
    }
    console.log("✅ 10 семей добавлены");
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
