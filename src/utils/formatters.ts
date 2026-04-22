export function decimalToNumber(value: unknown) {
	if (typeof (value as { toNumber?: () => number })?.toNumber === "function") {
		return (value as { toNumber: () => number }).toNumber();
	}

	return Number(value ?? 0);
}

export function formatCoins(value: unknown) {
	return decimalToNumber(value).toLocaleString("ru-RU", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
}

export function formatDate(value: Date | string | null | undefined) {
	if (!value) return "Неизвестно";

	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "Europe/Kiev",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
	if (!value) return "Неизвестно";

	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "Europe/Kiev",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

export function truncateText(value: string | null | undefined, max = 1000) {
	if (!value) return "Не указано";
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 1))}…`;
}
