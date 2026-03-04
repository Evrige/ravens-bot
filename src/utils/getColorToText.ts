type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
	const h = (hex || "").trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
	const n = parseInt(h, 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const RU_PALETTE: Array<{ name: string; rgb: Rgb }> = [
	// базовые
	{ name: "красный", rgb: { r: 255, g: 0, b: 0 } },
	{ name: "зелёный", rgb: { r: 0, g: 255, b: 0 } },
	{ name: "синий", rgb: { r: 0, g: 0, b: 255 } },
	{ name: "жёлтый", rgb: { r: 255, g: 255, b: 0 } },
	{ name: "оранжевый", rgb: { r: 255, g: 165, b: 0 } },
	{ name: "фиолетовый", rgb: { r: 128, g: 0, b: 128 } },
	{ name: "розовый", rgb: { r: 255, g: 105, b: 180 } },
	{ name: "голубой", rgb: { r: 0, g: 191, b: 255 } },
	{ name: "бирюзовый", rgb: { r: 64, g: 224, b: 208 } },
	{ name: "коричневый", rgb: { r: 139, g: 69, b: 19 } },
	{ name: "чёрный", rgb: { r: 0, g: 0, b: 0 } },
	{ name: "белый", rgb: { r: 255, g: 255, b: 255 } },
	{ name: "серый", rgb: { r: 128, g: 128, b: 128 } },

	// расширение палитры
	{ name: "бордовый", rgb: { r: 128, g: 0, b: 32 } },
	{ name: "алый", rgb: { r: 255, g: 36, b: 0 } },
	{ name: "малиновый", rgb: { r: 220, g: 20, b: 60 } },
	{ name: "пурпурный", rgb: { r: 176, g: 0, b: 255 } },

	{ name: "салатовый", rgb: { r: 124, g: 252, b: 0 } },
	{ name: "лаймовый", rgb: { r: 50, g: 205, b: 50 } },
	{ name: "оливковый", rgb: { r: 128, g: 128, b: 0 } },
	{ name: "хаки", rgb: { r: 143, g: 153, b: 82 } },
	{ name: "изумрудный", rgb: { r: 46, g: 204, b: 113 } },

	{ name: "небесно-голубой", rgb: { r: 135, g: 206, b: 235 } },
	{ name: "циановый", rgb: { r: 0, g: 255, b: 255 } },
	{ name: "лазурный", rgb: { r: 0, g: 127, b: 255 } },
	{ name: "васильковый", rgb: { r: 100, g: 149, b: 237 } },
	{ name: "индиго", rgb: { r: 75, g: 0, b: 130 } },
	{ name: "тёмно-синий", rgb: { r: 0, g: 0, b: 139 } },

	{ name: "лавандовый", rgb: { r: 181, g: 126, b: 220 } },
	{ name: "сиреневый", rgb: { r: 200, g: 162, b: 200 } },
	{ name: "лиловый", rgb: { r: 199, g: 21, b: 133 } },

	{ name: "персиковый", rgb: { r: 255, g: 218, b: 185 } },
	{ name: "коралловый", rgb: { r: 255, g: 127, b: 80 } },
	{ name: "лососёвый", rgb: { r: 250, g: 128, b: 114 } },

	{ name: "бежевый", rgb: { r: 245, g: 245, b: 220 } },
	{ name: "кремовый", rgb: { r: 255, g: 253, b: 208 } },
	{ name: "песочный", rgb: { r: 237, g: 201, b: 175 } },
	{ name: "золотой", rgb: { r: 255, g: 215, b: 0 } },

	{ name: "шоколадный", rgb: { r: 123, g: 63, b: 0 } },
	{ name: "терракотовый", rgb: { r: 204, g: 78, b: 92 } },
	{ name: "медный", rgb: { r: 184, g: 115, b: 51 } },

	{ name: "серебристый", rgb: { r: 192, g: 192, b: 192 } },
	{ name: "тёмно-серый", rgb: { r: 64, g: 64, b: 64 } },
	{ name: "светло-серый", rgb: { r: 211, g: 211, b: 211 } },
];

function rgbDist2(a: Rgb, b: Rgb) {
	const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
	return dr * dr + dg * dg + db * db;
}

export function hexToRuColorName(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return "неизвестный цвет";

	let best = RU_PALETTE[0]!;
	let bestD = rgbDist2(rgb, best.rgb);

	for (const c of RU_PALETTE) {
		const d = rgbDist2(rgb, c.rgb);
		if (d < bestD) {
			best = c;
			bestD = d;
		}
	}

	return best.name;
}