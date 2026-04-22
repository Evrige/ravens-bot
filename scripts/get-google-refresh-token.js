"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/get-google-refresh-token.ts
require("dotenv/config");
const node_readline_1 = __importDefault(require("node:readline"));
const googleapis_1 = require("googleapis");
async function main() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId)
        throw new Error("GOOGLE_CLIENT_ID is not set");
    if (!clientSecret)
        throw new Error("GOOGLE_CLIENT_SECRET is not set");
    if (!redirectUri)
        throw new Error("GOOGLE_REDIRECT_URI is not set");
    const oauth2Client = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
        ],
    });
    console.log("\nOpen this URL in browser:\n");
    console.log(authUrl);
    console.log("\nAfter login paste the code here:\n");
    const rl = node_readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const code = await new Promise((resolve) => {
        rl.question("Code: ", (answer) => resolve(answer.trim()));
    });
    rl.close();
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\nTOKENS:\n");
    console.log(JSON.stringify(tokens, null, 2));
    if (!tokens.refresh_token) {
        console.log("\nNo refresh_token returned. Remove previously granted app access in Google Account and run again with prompt=consent.\n");
        return;
    }
    console.log("\nPut this into .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
