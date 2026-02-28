import express from "express";

export function startWebServer() {
	const app = express();
	const PORT = Number(process.env.WEB_PORT) || 3000;

	app.get("/auth/twitch/callback", async (req, res) => {
		const code = req.query.code;
		console.log("🎯 Twitch code:", code);
		res.send("Авторизация Twitch успешна. Можешь закрыть окно.");
	});

	// слушаем на всех интерфейсах
	app.listen(PORT, "0.0.0.0", () => {
		console.log(`🌐 OAuth сервер запущен на ${process.env.TWITCH_REDIRECT_URI}`);
	});
}