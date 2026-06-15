import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

export type FactionRoleRecord = {
	id: string;
	name: string;
	roleId: string;
	createdAt: string;
	updatedAt: string;
};

const STORE_PATH = path.resolve(process.cwd(), "src", "data", "factionRoles.json");
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
	await mkdir(path.dirname(STORE_PATH), { recursive: true });
	try {
		await readFile(STORE_PATH, "utf-8");
	} catch {
		await writeFile(STORE_PATH, "[]", "utf-8");
	}
}

async function readFactionRolesUnsafe(): Promise<FactionRoleRecord[]> {
	await ensureStoreFile();
	const raw = await readFile(STORE_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((entry): entry is FactionRoleRecord => {
			return (
				typeof entry?.id === "string" &&
				typeof entry?.name === "string" &&
				typeof entry?.roleId === "string"
			);
		});
	} catch {
		return [];
	}
}

async function writeFactionRolesUnsafe(records: FactionRoleRecord[]) {
	await ensureStoreFile();
	await writeFile(STORE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export async function getFactionRoles() {
	return readFactionRolesUnsafe();
}

export async function getFactionRoleById(id: string) {
	const records = await readFactionRolesUnsafe();
	return records.find((record) => record.id === id) ?? null;
}

export async function mutateFactionRoles<T>(
	mutator: (records: FactionRoleRecord[]) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const records = await readFactionRolesUnsafe();
		const result = await mutator(records);
		await writeFactionRolesUnsafe(records);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
