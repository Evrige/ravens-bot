export function extractTwitchLogin(value: string): string | null {
	try {
		const withProtocol = /^https?:\/\//i.test(value.trim())
			? value.trim()
			: `https://${value.trim()}`;
		const parsed = new URL(withProtocol);
		const hostname = parsed.hostname.toLowerCase();

		if (hostname !== "twitch.tv" && hostname !== "www.twitch.tv") return null;

		const login = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
		if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) return null;

		return login;
	} catch {
		return null;
	}
}

export function normalizeTwitchUrl(login: string) {
	return `https://www.twitch.tv/${login}`;
}

export function extractDiscordUserId(value: string): string | null {
	const match = value.trim().match(/^(?:<@!?)?(\d{17,20})>?$/);
	return match?.[1] ?? null;
}
