export function formatHoursFromSeconds(sec: bigint) {
	const hours = Number(sec) / 3600;
	return `${hours.toFixed(0)}ч`;
}

export function progressBar(current: number, max: number, size = 14) {
	const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, current / max));
	const filled = Math.round(ratio * size);
	return "▓".repeat(filled) + "░".repeat(size - filled);
}