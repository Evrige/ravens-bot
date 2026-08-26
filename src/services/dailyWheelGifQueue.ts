import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import {
	renderDailyWheelGif,
	WheelVisualReward,
} from "../utils/renderDailyWheel";

type GifTask = {
	rewards: WheelVisualReward[];
	targetRotation: number;
	result: WheelVisualReward;
	resolve: (buffer: Buffer) => void;
	reject: (error: Error) => void;
};

const MAX_CONCURRENT_WORKERS = 2;
const queue: GifTask[] = [];
let activeWorkers = 0;

function runInWorker(task: GifTask) {
	const workerPath = path.join(__dirname, "..", "workers", "dailyWheelGifWorker.js");

	if (!fs.existsSync(workerPath)) {
		return renderDailyWheelGif(task.rewards, task.targetRotation, task.result);
	}

	return new Promise<Buffer>((resolve, reject) => {
		const worker = new Worker(workerPath);
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			void worker.terminate();
			callback();
		};
		const timeout = setTimeout(() => {
			finish(() => reject(new Error("Daily wheel GIF worker timed out")));
		}, 60_000);

		worker.once("message", (message: any) => {
			if (message?.ok && message.buffer) {
				finish(() => resolve(Buffer.from(message.buffer)));
				return;
			}
			finish(() => reject(new Error(message?.error || "Daily wheel GIF worker failed")));
		});

		worker.once("error", (error) => finish(() => reject(error)));
		worker.postMessage({
			rewards: task.rewards,
			targetRotation: task.targetRotation,
			result: task.result,
		});
	}).catch((error) => {
		console.error("[daily-wheel] GIF worker failed, using main thread:", error);
		return renderDailyWheelGif(task.rewards, task.targetRotation, task.result);
	});
}

function processQueue() {
	while (activeWorkers < MAX_CONCURRENT_WORKERS && queue.length) {
		const task = queue.shift()!;
		activeWorkers += 1;

		runInWorker(task)
			.then(task.resolve, task.reject)
			.finally(() => {
				activeWorkers -= 1;
				processQueue();
			});
	}
}

export function enqueueDailyWheelGif(params: {
	rewards: WheelVisualReward[];
	targetRotation: number;
	result: WheelVisualReward;
}) {
	return new Promise<Buffer>((resolve, reject) => {
		queue.push({ ...params, resolve, reject });
		processQueue();
	});
}
