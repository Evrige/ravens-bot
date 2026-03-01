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

	// очень тёмный / очень светлый
	if (brightness < 60) return "⚫";
	if (brightness > 220) return "⚪";

	const hue = rgbToHue(rgb);

	// грубая карта по оттенкам
	if (hue < 15 || hue >= 345) return "🔴";
	if (hue < 45) return "🟠";
	if (hue < 75) return "🟡";
	if (hue < 165) return "🟢";
	if (hue < 255) return "🔵";
	if (hue < 315) return "🟣";
	return "⚪";
}