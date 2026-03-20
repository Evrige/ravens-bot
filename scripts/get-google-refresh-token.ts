// scripts/get-google-refresh-token.ts
import "dotenv/config";
import readline from "node:readline";
import { google } from "googleapis";

async function main() {
	const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
	const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

	if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
	if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
	if (!redirectUri) throw new Error("GOOGLE_REDIRECT_URI is not set");

	const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const code: string = await new Promise((resolve) => {
		rl.question("Code: ", (answer) => resolve(answer.trim()));
	});

	rl.close();

	const { tokens } = await oauth2Client.getToken(code);

	console.log("\nTOKENS:\n");
	console.log(JSON.stringify(tokens, null, 2));

	if (!tokens.refresh_token) {
		console.log(
			"\nNo refresh_token returned. Remove previously granted app access in Google Account and run again with prompt=consent.\n",
		);
		return;
	}

	console.log("\nPut this into .env:\n");
	console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});