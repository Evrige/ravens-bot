import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

export type CoinflipStatus = "pending" | "rolling" | "finished" | "declined" | "cancelled";
export type CoinflipSide = "LONDO" | "PHOENIX";

export type PersistedCoinflipChallenge = {
	id: string;
	channelId: string;
	messageId: string | null;
	creatorId: string;
	creatorTag: string;
	targetUserId: string | null;
	opponentId: string | null;
	amount: number;
	status: CoinflipStatus;
	createdAt: number;
	expiresAt: number;
	rollStartedAt: number | null;
	rollEndsAt: number | null;
	creatorSide: CoinflipSide | null;
	opponentSide: CoinflipSide | null;
	winnerSide: CoinflipSide | null;
	londoUserId: string | null;
	phoenixUserId: string | null;
	winnerId: string | null;
};

const STORE_PATH = path.resolve(process.cwd(), "src", "data", "coinflips.json");
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
	await mkdir(path.dirname(STORE_PATH), { recursive: true });
	try {
		await readFile(STORE_PATH, "utf-8");
	} catch {
		await writeFile(STORE_PATH, "[]", "utf-8");
	}
}

async function readAllUnsafe(): Promise<PersistedCoinflipChallenge[]> {
	await ensureStoreFile();
	const raw = await readFile(STORE_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

async function writeAllUnsafe(items: PersistedCoinflipChallenge[]) {
	await ensureStoreFile();
	await writeFile(STORE_PATH, JSON.stringify(items, null, 2), "utf-8");
}

export async function listCoinflipChallenges() {
	return readAllUnsafe();
}

export async function upsertCoinflipChallenge(challenge: PersistedCoinflipChallenge) {
	const task = writeQueue.catch(() => {}).then(async () => {
		const items = await readAllUnsafe();
		const next = items.filter((item) => item.id !== challenge.id);
		next.push(challenge);
		await writeAllUnsafe(next);
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}

export async function removeCoinflipChallenge(challengeId: string) {
	const task = writeQueue.catch(() => {}).then(async () => {
		const items = await readAllUnsafe();
		await writeAllUnsafe(items.filter((item) => item.id !== challengeId));
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
