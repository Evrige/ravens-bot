import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";
import { GiveawayTemplateKey } from "../config/giveawayTemplates";

export interface GiveawayRecord {
	id: string;
	guildId: string;
	channelId: string;
	messageId: string;
	creatorId: string;
	prize: string;
	imageUrl: string | null;
	description: string | null;
	winnersCount: number;
	endAt: string;
	template: GiveawayTemplateKey;
	participants: string[];
	winners: string[];
	ended: boolean;
	announcementSent: boolean;
	announcementMessageId: string | null;
	createdAt: string;
	endedAt: string | null;
}

const GIVEAWAYS_FILE_PATH = path.resolve(process.cwd(), "src", "data", "giveaways.json");
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
	await mkdir(path.dirname(GIVEAWAYS_FILE_PATH), { recursive: true });
	try {
		await readFile(GIVEAWAYS_FILE_PATH, "utf-8");
	} catch {
		await writeFile(GIVEAWAYS_FILE_PATH, "[]", "utf-8");
	}
}

async function readGiveawaysUnsafe(): Promise<GiveawayRecord[]> {
	await ensureStoreFile();
	const raw = await readFile(GIVEAWAYS_FILE_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as GiveawayRecord[]) : [];
	} catch {
		return [];
	}
}

async function writeGiveawaysUnsafe(records: GiveawayRecord[]) {
	await ensureStoreFile();
	await writeFile(GIVEAWAYS_FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export async function getAllGiveaways() {
	return readGiveawaysUnsafe();
}

export async function getGiveawayById(id: string) {
	const giveaways = await readGiveawaysUnsafe();
	return giveaways.find((giveaway) => giveaway.id === id) ?? null;
}

export async function mutateGiveaways<T>(
	mutator: (records: GiveawayRecord[]) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const records = await readGiveawaysUnsafe();
		const result = await mutator(records);
		await writeGiveawaysUnsafe(records);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
