import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

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

export async function getMarketSettings() {
	return readSettingsUnsafe();
}

export async function mutateMarketSettings<T>(
	mutator: (settings: MarketSettings) => Promise<T> | T
): Promise<T> {
	const task = writeQueue.catch(() => {}).then(async () => {
		const settings = await readSettingsUnsafe();
		const result = await mutator(settings);
		await writeSettingsUnsafe(settings);
		return result;
	});

	writeQueue = task.then(() => undefined, () => undefined);
	return task;
}
