import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

export type FamilyVacationStatus = "ACTIVE" | "ENDED" | "EXPIRED";

export type FamilyVacationRecord = {
	id: string;
	userId: string;
	username: string;
	reason: string;
	startedAt: string;
	endAt: string;
	status: FamilyVacationStatus;
	closedAt: string | null;
};

const STORE_PATH = path.resolve(process.cwd(), "src", "data", "familyVacations.json");
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
	await mkdir(path.dirname(STORE_PATH), { recursive: true });
	try {
		await readFile(STORE_PATH, "utf-8");
	} catch {
		await writeFile(STORE_PATH, "[]", "utf-8");
	}
}

async function readVacationsUnsafe(): Promise<FamilyVacationRecord[]> {
	await ensureStoreFile();
	const raw = await readFile(STORE_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((entry): entry is FamilyVacationRecord => {
			return (
				typeof entry?.id === "string" &&
				typeof entry?.userId === "string" &&
				typeof entry?.username === "string" &&
				typeof entry?.reason === "string" &&
				typeof entry?.startedAt === "string" &&
				typeof entry?.endAt === "string" &&
				typeof entry?.status === "string"
			);
		});
	} catch {
		return [];
	}
}

async function writeVacationsUnsafe(records: FamilyVacationRecord[]) {
	await ensureStoreFile();
	await writeFile(STORE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export async function getFamilyVacations() {
	return readVacationsUnsafe();
}

export async function getActiveVacationRecord(userId: string) {
	const records = await readVacationsUnsafe();
	return records.find((record) => record.userId === userId && record.status === "ACTIVE") ?? null;
}

export async function mutateFamilyVacations<T>(
	mutator: (records: FamilyVacationRecord[]) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const records = await readVacationsUnsafe();
		const result = await mutator(records);
		await writeVacationsUnsafe(records);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
