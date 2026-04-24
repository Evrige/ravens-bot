import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

export type FamilyGameRecord = {
	id: string;
	name: string;
	roleId: string;
	textChannelId: string;
	voiceChannelIds: string[];
	createdAt: string;
	updatedAt: string;
};

const STORE_PATH = path.resolve(process.cwd(), "src", "data", "familyGames.json");
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
	await mkdir(path.dirname(STORE_PATH), { recursive: true });
	try {
		await readFile(STORE_PATH, "utf-8");
	} catch {
		await writeFile(STORE_PATH, "[]", "utf-8");
	}
}

async function readGamesUnsafe(): Promise<FamilyGameRecord[]> {
	await ensureStoreFile();
	const raw = await readFile(STORE_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.filter((entry): entry is FamilyGameRecord => {
				return (
					typeof entry?.id === "string" &&
					typeof entry?.name === "string" &&
					typeof entry?.roleId === "string" &&
					typeof entry?.textChannelId === "string" &&
					Array.isArray(entry?.voiceChannelIds)
				);
			})
			.map((entry) => ({
				...entry,
				voiceChannelIds: entry.voiceChannelIds.filter((value): value is string => typeof value === "string"),
			}));
	} catch {
		return [];
	}
}

async function writeGamesUnsafe(games: FamilyGameRecord[]) {
	await ensureStoreFile();
	await writeFile(STORE_PATH, JSON.stringify(games, null, 2), "utf-8");
}

export async function getFamilyGames() {
	return readGamesUnsafe();
}

export async function getFamilyGameById(id: string) {
	const games = await readGamesUnsafe();
	return games.find((game) => game.id === id) ?? null;
}

export async function mutateFamilyGames<T>(
	mutator: (games: FamilyGameRecord[]) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const games = await readGamesUnsafe();
		const result = await mutator(games);
		await writeGamesUnsafe(games);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
