import { createCanvas, loadImage } from "canvas";

export async function renderProfileCardPng(opts: {
	username: string;
	level: number;
	isMarry: boolean; // ✅ добавили
	xp: number;
	need: number;
	voiceText: string;
	msgs: string;
	coins: number;
	warns: number;
	mute: boolean;
	ban: boolean;
	avatarUrl: string;
}): Promise<Buffer> {
	const W = 1000;
	const H = 420; // ✅ было 360, стало выше

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");

	// background
	ctx.fillStyle = "#2b2d31";
	ctx.fillRect(0, 0, W, H);

	// card
	roundRect(ctx, 20, 20, W - 40, H - 40, 18);
	ctx.fillStyle = "#313338";
	ctx.fill();

	// avatar (чуть больше)
	const avatar = await loadImage(opts.avatarUrl);
	const ax = 820, ay = 45, as = 120; // ✅ было 110
	roundRect(ctx, ax, ay, as, as, 18);
	ctx.save();
	ctx.clip();
	ctx.drawImage(avatar, ax, ay, as, as);
	ctx.restore();

	// username (крупнее)
	ctx.fillStyle = "#ffffff";
	ctx.font = "700 32px sans-serif"; // ✅ было 28
	ctx.fillText(opts.username, 60, 78);

	// level + marry
	ctx.fillStyle = "#cfcfcf";
	ctx.font = "600 20px sans-serif"; // ✅ было 18

	const marryText = opts.isMarry ? " • Женат" : "";
	ctx.fillText(`Уровень: ${opts.level}${marryText}`, 60, 116);

	// progress title
	ctx.fillStyle = "#ffffff";
	ctx.font = "700 20px sans-serif"; // ✅ было 18
	ctx.fillText("Прогресс", 60, 175);

	// progress bar (чуть ниже, чуть выше)
	const barX = 60, barY = 198, barW = 720, barH = 28; // ✅ было 26
	roundRect(ctx, barX, barY, barW, barH, 14);
	ctx.fillStyle = "#1f2124";
	ctx.fill();

	const ratio = Math.max(0, Math.min(1, opts.xp / Math.max(1, opts.need)));
	const fillW = Math.max(18, Math.floor(barW * ratio));
	roundRect(ctx, barX, barY, fillW, barH, 14);
	ctx.fillStyle = "#5865f2";
	ctx.fill();

	ctx.fillStyle = "#ffffff";
	ctx.font = "700 17px sans-serif"; // ✅ чуть больше
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(`XP ${opts.xp}/${opts.need}`, barX + barW / 2, barY + barH / 2);
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";

	// two columns: stats / activity (опустили ниже, чтобы было “воздуха”)
	const colY = 285;

	// left column title
	ctx.fillStyle = "#ffffff";
	ctx.font = "700 20px sans-serif"; // ✅ было 18
	ctx.fillText("Статистика", 60, colY);

	// left column body (крупнее)
	ctx.fillStyle = "#d7d7d7";
	ctx.font = "600 17px sans-serif"; // ✅ было 16
	ctx.fillText(`🎙️ Войс: ${opts.voiceText}`, 60, colY + 36);
	ctx.fillText(`💬 Сообщения: ${opts.msgs}`, 60, colY + 64);
	ctx.fillText(`🪙 Монеты: ${opts.coins}`, 60, colY + 92);

	// right column title
	ctx.fillStyle = "#ffffff";
	ctx.font = "700 20px sans-serif";
	ctx.fillText("Активность", 520, colY);

	// right column body
	ctx.fillStyle = "#d7d7d7";
	ctx.font = "600 17px sans-serif";
	ctx.fillText(`⚠️ Варны: ${opts.warns}`, 520, colY + 36);
	ctx.fillText(`🔇 Мут: ${opts.mute ? "да" : "нет"}`, 520, colY + 64);
	ctx.fillText(`⛔ Бан: ${opts.ban ? "да" : "нет"}`, 520, colY + 92);

	return canvas.toBuffer("image/png");
}

function roundRect(
	ctx: import("canvas").CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	const radius = Math.min(r, h / 2, w / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + w, y, x + w, y + h, radius);
	ctx.arcTo(x + w, y + h, x, y + h, radius);
	ctx.arcTo(x, y + h, x, y, radius);
	ctx.arcTo(x, y, x + w, y, radius);
	ctx.closePath();
}