import { parentPort } from "node:worker_threads";
import {
	renderDailyWheelGif,
	WheelVisualReward,
} from "../utils/renderDailyWheel";

type WorkerRequest = {
	rewards: WheelVisualReward[];
	targetRotation: number;
	result: WheelVisualReward;
};

parentPort?.once("message", async (request: WorkerRequest) => {
	try {
		const buffer = await renderDailyWheelGif(
			request.rewards,
			request.targetRotation,
			request.result
		);
		parentPort?.postMessage({ ok: true, buffer });
	} catch (error) {
		parentPort?.postMessage({
			ok: false,
			error: error instanceof Error ? error.stack || error.message : String(error),
		});
	}
});
