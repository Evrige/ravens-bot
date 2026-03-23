export function normalizeHex(hex?: string | null): string {
	if (!hex) return "#5865F2";

	const value = hex.trim().toUpperCase();
	return value.startsWith("#") ? value : `#${value}`;
}

function hexToRgb(hex?: string | null) {
	const color = normalizeHex(hex);

	return {
		r: parseInt(color.slice(1, 3), 16),
		g: parseInt(color.slice(3, 5), 16),
		b: parseInt(color.slice(5, 7), 16),
	};
}

export function getColorEmoji(hex?: string | null): string {
	const name = getColorName(hex);

	const emojiMap: Record<string, string> = {
		"Красный": "🔴",
		"Тёмно-красный": "🔴",
		"Бордовый": "🔴",
		"Малиновый": "🩷",
		"Розовый": "🩷",
		"Персиковый": "🩷",
		"Оранжевый": "🟠",
		"Жёлтый": "🟡",
		"Золотой": "🟡",
		"Зелёный": "🟢",
		"Тёмно-зелёный": "🟢",
		"Салатовый": "🟢",
		"Лаймовый": "🟢",
		"Мятный": "🟢",
		"Бирюзовый": "🟦",
		"Голубой": "🔵",
		"Синий": "🔵",
		"Тёмно-синий": "🔵",
		"Фиолетовый": "🟣",
		"Сиреневый": "🟣",
		"Лавандовый": "🟣",
		"Белый": "⚪",
		"Серый": "⚪",
		"Серебряный": "⚪",
		"Чёрный": "⚫",
		"Коричневый": "🤎",
		"Бежевый": "🤎",
	};

	return emojiMap[name] || "🔹";
}

export function getColorName(hex?: string | null): string {
	const color = normalizeHex(hex);

	const exactMap: Record<string, string> = {
		"#FF0000": "Красный",
		"#DC143C": "Малиновый",
		"#8B0000": "Тёмно-красный",
		"#800000": "Бордовый",

		"#FFC0CB": "Розовый",
		"#FFDAB9": "Персиковый",

		"#FFA500": "Оранжевый",
		"#FFFF00": "Жёлтый",
		"#FFD700": "Золотой",

		"#00FF00": "Зелёный",
		"#228B22": "Тёмно-зелёный",
		"#7CFC00": "Салатовый",
		"#32CD32": "Лаймовый",
		"#98FF98": "Мятный",

		"#40E0D0": "Бирюзовый",
		"#00FFFF": "Бирюзовый",
		"#1E90FF": "Голубой",
		"#0000FF": "Синий",
		"#00008B": "Тёмно-синий",

		"#800080": "Фиолетовый",
		"#C8A2C8": "Сиреневый",
		"#E6E6FA": "Лавандовый",

		"#FFFFFF": "Белый",
		"#C0C0C0": "Серебряный",
		"#808080": "Серый",
		"#000000": "Чёрный",

		"#8B4513": "Коричневый",
		"#F5F5DC": "Бежевый",
	};

	if (exactMap[color]) return exactMap[color];

	const { r, g, b } = hexToRgb(color);

	// Чёрный / белый / серый
	if (r < 40 && g < 40 && b < 40) return "Чёрный";
	if (r > 235 && g > 235 && b > 235) return "Белый";
	if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15) return "Серый";

	// Красные
	if (r > 160 && g < 90 && b < 90) return "Красный";
	if (r > 120 && g < 70 && b < 70) return "Тёмно-красный";
	if (r > 130 && b > 70 && g < 90) return "Бордовый";

	// Розовые
	if (r > 200 && g > 120 && b > 140) return "Розовый";
	if (r > 220 && g > 170 && b > 140) return "Персиковый";

	// Оранжево-жёлтые
	if (r > 220 && g > 140 && g < 210 && b < 100) return "Оранжевый";
	if (r > 220 && g > 220 && b < 120) return "Жёлтый";
	if (r > 200 && g > 170 && b < 120) return "Золотой";

	// Зелёные
	if (g > 150 && r < 130 && b < 130) return "Зелёный";
	if (g > 110 && r < 100 && b < 100) return "Тёмно-зелёный";
	if (g > 180 && r > 100 && b < 120) return "Салатовый";
	if (g > 180 && r < 120 && b < 120) return "Лаймовый";
	if (g > 180 && r > 130 && b > 130) return "Мятный";

	// Синие / голубые / бирюзовые
	if (b > 170 && r < 120 && g < 120) return "Синий";
	if (b > 180 && g > 120 && r < 120) return "Голубой";
	if (g > 150 && b > 150 && r < 120) return "Бирюзовый";
	if (b > 110 && r < 80 && g < 80) return "Тёмно-синий";

	// Фиолетовые
	if (r > 120 && b > 120 && g < 110) return "Фиолетовый";
	if (r > 170 && b > 170 && g > 130) return "Лавандовый";
	if (r > 150 && b > 150 && g > 110) return "Сиреневый";

	// Коричневые / бежевые
	if (r > 100 && r < 170 && g > 60 && g < 110 && b < 80) return "Коричневый";
	if (r > 200 && g > 190 && b > 150 && b < 210) return "Бежевый";

	return "Неизвестный";
}