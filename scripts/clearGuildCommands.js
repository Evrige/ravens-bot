"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function main() {
    const token = process.env.TOKEN;
    const clientId = process.env.CLIENT_ID;
    const familyGuildId = process.env.FAMILY_SERVER_GUID;
    const dbGuildId = process.env.DB_SERVER_GUID;
    if (!token)
        throw new Error("TOKEN is not set in .env");
    if (!clientId)
        throw new Error("CLIENT_ID is not set in .env");
    const rest = new discord_js_1.REST({ version: "10" }).setToken(token);
    const guilds = [familyGuildId, dbGuildId].filter(Boolean);
    if (!guilds.length) {
        throw new Error("No guild ids found in .env");
    }
    for (const guildId of guilds) {
        try {
            await rest.put(discord_js_1.Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            console.log(`✅ Все guild-команды удалены с сервера ${guildId}`);
        }
        catch (error) {
            console.error(`❌ Ошибка при очистке команд на сервере ${guildId}:`, error);
        }
    }
    console.log("🏁 Готово. Все серверные команды очищены.");
}
main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
});
