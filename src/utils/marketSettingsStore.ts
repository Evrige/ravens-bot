import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";
import { prisma } from "./prisma";

type MarketSettings = {
	isOpen: boolean;
};

const SETTINGS_PATH = path.resolve(process.cwd(), "src", "data", "marketSettings.json");
const DEFAULT_SETTINGS: MarketSettings = { isOpen: true };
let writeQueue: Promise<void> = Promise.resolve();

async function ensureSettingsFile() {
	await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
	try {
		await readFile(SETTINGS_PATH, "utf-8");
	} catch {
		await writeFile(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
	}
}

async function readSettingsUnsafe(): Promise<MarketSettings> {
	await ensureSettingsFile();
	const raw = await readFile(SETTINGS_PATH, "utf-8");

	try {
		const parsed = JSON.parse(raw);
		return typeof parsed?.isOpen === "boolean" ? parsed as MarketSettings : DEFAULT_SETTINGS;
	} catch {
		return DEFAULT_SETTINGS;
	}
}

async function writeSettingsUnsafe(settings: MarketSettings) {
	await ensureSettingsFile();
	await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

type MarketSettingsRow = {
	id: number;
	isOpen: boolean;
	updatedAt: Date;
};

function isMissingMarketSettingsTableError(error: unknown) {
	const prismaError = error as {
		code?: string;
		meta?: { driverAdapterError?: { cause?: { code?: string } } };
		message?: string;
	};

	return prismaError?.code === "P2010"
		&& (
			prismaError?.meta?.driverAdapterError?.cause?.code === "42P01"
			|| prismaError?.message?.includes(`relation "MarketSettings" does not exist`)
			|| prismaError?.message?.includes(`отношение "MarketSettings" не существует`)
		);
}

async function readSettingsFromDb(): Promise<MarketSettings | null> {
	try {
		const [row] = await prisma.$queryRaw<MarketSettingsRow[]>`
			SELECT *
			FROM "MarketSettings"
			WHERE "id" = 1
			LIMIT 1
		`;

		return row ? { isOpen: row.isOpen } : null;
	} catch (error) {
		if (isMissingMarketSettingsTableError(error)) return null;
		throw error;
	}
}

async function upsertSettingsInDb(settings: MarketSettings) {
	try {
		const [row] = await prisma.$queryRaw<MarketSettingsRow[]>`
			INSERT INTO "MarketSettings" ("id", "isOpen", "updatedAt")
			VALUES (1, ${settings.isOpen}, NOW())
			ON CONFLICT ("id")
			DO UPDATE SET
				"isOpen" = EXCLUDED."isOpen",
				"updatedAt" = NOW()
			RETURNING *
		`;

		return row ? { isOpen: row.isOpen } : settings;
	} catch (error) {
		if (isMissingMarketSettingsTableError(error)) {
			await writeSettingsUnsafe(settings);
			return settings;
		}
		throw error;
	}
}

export async function getMarketSettings() {
	const dbSettings = await readSettingsFromDb();
	if (dbSettings) return dbSettings;

	const fileSettings = await readSettingsUnsafe();
	await upsertSettingsInDb(fileSettings);
	return fileSettings;
}

export async function mutateMarketSettings<T>(
	mutator: (settings: MarketSettings) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const settings = await getMarketSettings();
		const result = await mutator(settings);
		await upsertSettingsInDb(settings);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
