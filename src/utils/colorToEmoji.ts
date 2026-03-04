function hexToRgb(hex: string) {
	const h = hex.replace("#", "").trim();
	if (h.length !== 6) return null;

	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);

	if ([r, g, b].some(n => Number.isNaN(n))) return null;
	return { r, g, b };
}

function rgbToHue({ r, g, b }: { r: number; g: number; b: number }) {
	const rn = r / 255, gn = g / 255, bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const d = max - min;

	if (d === 0) return 0;

	let h = 0;

	if (max === rn) h = ((gn - bn) / d) % 6;
	else if (max === gn) h = (bn - rn) / d + 2;
	else h = (rn - gn) / d + 4;

	h *= 60;
	if (h < 0) h += 360;

	return h;
}

export function colorToEmoji(hex: string) {
	const rgb = hexToRgb(hex);
	if (!rgb) return "⚪";

	const { r, g, b } = rgb;

	const brightness = (r * 299 + g * 587 + b * 114) / 1000;

	// очень тёмный
	if (brightness < 50) return "⚫";

	// очень светлый
	if (brightness > 230) return "⚪";

	// розовый (много красного и синего, мало зелёного)
	if (r > 200 && b > 150 && g < 180) return "🩷";

	// голубой / циан
	if (g > 180 && b > 180 && r < 150) return "🩵";

	// коричневый
	if (r > 120 && g > 70 && g < 140 && b < 80) return "🟤";

	const hue = rgbToHue(rgb);

	// точнее делим оттенки
	if (hue < 15 || hue >= 345) return "🔴";
	if (hue < 35) return "🟠";
	if (hue < 65) return "🟡";
	if (hue < 170) return "🟢";
	if (hue < 250) return "🔵";
	if (hue < 320) return "🟣";

	return "⚪";
}