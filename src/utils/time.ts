export function formatTime(ms: bigint) {
	const totalSeconds = Math.floor(Number(ms) / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	return `${hours}ч ${minutes}м`;
}