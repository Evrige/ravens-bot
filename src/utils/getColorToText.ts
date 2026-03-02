type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
	const h = (hex || "").trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
	const n = parseInt(h, 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const RU_PALETTE: Array<{ name: string; rgb: Rgb }> = [
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
		if (d < bestD) { best = c; bestD = d; }
	}
	return best.name;
}
