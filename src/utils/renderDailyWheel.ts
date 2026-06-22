import axios from "axios";
import { createCanvas, loadImage } from "canvas";
const GIFEncoder = require("gif-encoder-2");

export type WheelVisualReward = {
	id: number | null;
	name: string;
	chance: number;
	rewardType: string;
	amount: number | null;
	imageUrl?: string | null;
};

const SIZE = 900;
const CENTER = SIZE / 2;
const RADIUS = 345;
const COLORS = [
	"#7C3AED",
	"#EC4899",
	"#F97316",
	"#EAB308",
	"#22C55E",
	"#06B6D4",
	"#3B82F6",
	"#6366F1",
];
const GIF_FRAME_COUNT = 48;
const GIF_FRAME_DELAY_MS = 110;
export const DAILY_WHEEL_GIF_SPIN_MS =
	(GIF_FRAME_COUNT - 1) * GIF_FRAME_DELAY_MS + 250;
const imageCache = new Map<string, Promise<any | null>>();

function loadRewardImage(url: string) {
	const cached = imageCache.get(url);
	if (cached) return cached;

	const promise = axios
		.get<ArrayBuffer>(url, {
			responseType: "arraybuffer",
			timeout: 7000,
			maxContentLength: 5 * 1024 * 1024,
			maxBodyLength: 5 * 1024 * 1024,
		})
		.then((response) => loadImage(Buffer.from(response.data)))
		.catch(() => null);

	imageCache.set(url, promise);
	return promise;
}

function drawContainedImage(
	ctx: any,
	image: any,
	x: number,
	y: number,
	maxWidth: number,
	maxHeight: number
) {
	const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
	const width = image.width * scale;
	const height = image.height * scale;
	const padding = 7;

	ctx.save();
	ctx.fillStyle = "rgba(9, 9, 11, 0.72)";
	ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.roundRect(
		x - width / 2 - padding,
		y - height / 2 - padding,
		width + padding * 2,
		height + padding * 2,
		10
	);
	ctx.fill();
	ctx.stroke();
	ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
	ctx.restore();
}

function formatReward(reward: WheelVisualReward) {
	if (reward.rewardType === "COINS" && reward.amount) {
		return `${reward.amount.toLocaleString("ru-RU")} монет`;
	}
	return reward.name;
}

function fitText(ctx: any, text: string, maxWidth: number, startSize: number, minSize = 15) {
	let size = startSize;
	while (size > minSize) {
		ctx.font = `700 ${size}px Arial`;
		if (ctx.measureText(text).width <= maxWidth) break;
		size -= 1;
	}
	return size;
}

export function getWheelRewards(
	rewards: Array<{
		id: number;
		name: string;
		chance: number;
		rewardType: string;
		amount: number | null;
	}>
) {
	const total = rewards.reduce((sum, reward) => sum + reward.chance, 0);
	const visual: WheelVisualReward[] = rewards.map((reward) => ({ ...reward }));

	if (total < 100) {
		visual.push({
			id: null,
			name: "Без выигрыша",
			chance: 100 - total,
			rewardType: "NONE",
			amount: null,
		});
	}

	return visual;
}

export function getRewardCenterAngle(rewards: WheelVisualReward[], rewardId: number | null) {
	let cursor = 0;
	for (const reward of rewards) {
		const arc = (reward.chance / 100) * Math.PI * 2;
		if (reward.id === rewardId) return cursor + arc / 2;
		cursor += arc;
	}
	return 0;
}

export async function renderDailyWheel(
	rewards: WheelVisualReward[],
	rotation: number,
	result?: WheelVisualReward | null
) {
	const canvas = createCanvas(SIZE, SIZE);
	const ctx = canvas.getContext("2d");

	const background = ctx.createLinearGradient(0, 0, SIZE, SIZE);
	background.addColorStop(0, "#111827");
	background.addColorStop(0.55, "#24113A");
	background.addColorStop(1, "#09090B");
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, SIZE, SIZE);

	ctx.save();
	ctx.translate(CENTER, CENTER);
	ctx.shadowColor = "rgba(168, 85, 247, 0.8)";
	ctx.shadowBlur = 45;
	ctx.beginPath();
	ctx.arc(0, 0, RADIUS + 22, 0, Math.PI * 2);
	ctx.fillStyle = "#E9D5FF";
	ctx.fill();
	ctx.restore();

	let cursor = rotation;
	for (let index = 0; index < rewards.length; index += 1) {
		const reward = rewards[index];
		const arc = (reward.chance / 100) * Math.PI * 2;
		const end = cursor + arc;

		ctx.beginPath();
		ctx.moveTo(CENTER, CENTER);
		ctx.arc(CENTER, CENTER, RADIUS, cursor, end);
		ctx.closePath();
		ctx.fillStyle = reward.rewardType === "NONE" ? "#374151" : COLORS[index % COLORS.length];
		ctx.fill();
		ctx.strokeStyle = "rgba(255,255,255,0.75)";
		ctx.lineWidth = 4;
		ctx.stroke();

		if (arc >= 0.11) {
			const middle = cursor + arc / 2;
			const label = formatReward(reward);
			const maxWidth = Math.min(230, RADIUS * arc * 0.75);
			const image = reward.imageUrl
				? await loadRewardImage(reward.imageUrl)
				: null;

			if (image && arc >= 0.2) {
				const imageSize = Math.max(52, Math.min(118, RADIUS * arc * 0.7));
				drawContainedImage(
					ctx,
					image,
					CENTER + Math.cos(middle) * (RADIUS * 0.65),
					CENTER + Math.sin(middle) * (RADIUS * 0.65),
					imageSize,
					imageSize * 0.82
				);
			} else {

				ctx.save();
				ctx.translate(
					CENTER + Math.cos(middle) * (RADIUS * 0.66),
					CENTER + Math.sin(middle) * (RADIUS * 0.66)
				);
				ctx.rotate(middle + Math.PI / 2);
				if (middle > Math.PI / 2 && middle < Math.PI * 1.5) ctx.rotate(Math.PI);
				const size = fitText(ctx, label, maxWidth, 27);
				ctx.font = `700 ${size}px Arial`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillStyle = "#FFFFFF";
				ctx.shadowColor = "rgba(0,0,0,0.8)";
				ctx.shadowBlur = 5;
				ctx.fillText(label, 0, 0);
				ctx.restore();
			}
		}

		cursor = end;
	}

	ctx.beginPath();
	ctx.arc(CENTER, CENTER, 105, 0, Math.PI * 2);
	const hub = ctx.createRadialGradient(CENTER - 25, CENTER - 30, 10, CENTER, CENTER, 110);
	hub.addColorStop(0, "#F5D0FE");
	hub.addColorStop(0.35, "#A855F7");
	hub.addColorStop(1, "#4C1D95");
	ctx.fillStyle = hub;
	ctx.fill();
	ctx.strokeStyle = "#FFFFFF";
	ctx.lineWidth = 7;
	ctx.stroke();

	ctx.fillStyle = "#FFFFFF";
	ctx.textAlign = "center";
	ctx.font = "800 30px Arial";
	ctx.fillText("LONDO", CENTER, CENTER - 8);
	ctx.font = "700 18px Arial";
	ctx.fillStyle = "#F3E8FF";
	ctx.fillText("DAILY WHEEL", CENTER, CENTER + 25);

	ctx.beginPath();
	ctx.moveTo(CENTER, 58);
	ctx.lineTo(CENTER - 34, 15);
	ctx.lineTo(CENTER + 34, 15);
	ctx.closePath();
	ctx.fillStyle = "#FACC15";
	ctx.shadowColor = "rgba(250, 204, 21, 0.9)";
	ctx.shadowBlur = 18;
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.strokeStyle = "#FFFFFF";
	ctx.lineWidth = 4;
	ctx.stroke();

	if (result) {
		const text = result.rewardType === "NONE"
			? "Сегодня без выигрыша"
			: `Вы выиграли: ${formatReward(result)}`;
		ctx.fillStyle = "rgba(9, 9, 11, 0.88)";
		ctx.fillRect(95, 790, 710, 72);
		const fontSize = fitText(ctx, text, 650, 32, 20);
		ctx.font = `800 ${fontSize}px Arial`;
		ctx.fillStyle = result.rewardType === "NONE" ? "#D1D5DB" : "#FDE68A";
		ctx.textAlign = "center";
		ctx.fillText(text, CENTER, 837);
	}

	return canvas.toBuffer("image/png");
}

export async function renderDailyWheelGif(
	rewards: WheelVisualReward[],
	targetRotation: number,
	result: WheelVisualReward
) {
	const gifSize = 540;
	const frameCount = GIF_FRAME_COUNT;
	const encoder = new GIFEncoder(gifSize, gifSize, "octree", true, frameCount);
	const gifCanvas = createCanvas(gifSize, gifSize);
	const gifContext = gifCanvas.getContext("2d");

	encoder.start();
	encoder.setRepeat(-1);
	encoder.setQuality(10);
	encoder.setThreshold(85);

	for (let frame = 0; frame < frameCount; frame += 1) {
		const progress = frame / (frameCount - 1);
		const eased = 1 - Math.pow(1 - progress, 4);
		const rotation = targetRotation * eased;
		const isFinal = frame === frameCount - 1;
		const png = await renderDailyWheel(
			rewards,
			rotation,
			isFinal ? result : null
		);
		const image = await loadImage(png);

		gifContext.clearRect(0, 0, gifSize, gifSize);
		gifContext.drawImage(image, 0, 0, gifSize, gifSize);
		encoder.setDelay(isFinal ? 1_500 : GIF_FRAME_DELAY_MS);
		encoder.addFrame(gifContext);
	}

	encoder.finish();
	return Buffer.from(encoder.out.getData());
}
