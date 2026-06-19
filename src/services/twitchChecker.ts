import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";

let appAccessToken: string | null = null;

async function getAppAccessToken() {
	const response = await axios.post(
		"https://id.twitch.tv/oauth2/token",
		null,
		{
			params: {
				client_id: process.env.TWITCH_CLIENT_ID,
				client_secret: process.env.TWITCH_CLIENT_SECRET,
				grant_type: "client_credentials",
			},
		}
	);
	appAccessToken = response.data.access_token;
}

async function checkStreams(client: Client) {
	if (!appAccessToken) await getAppAccessToken();

	const streamers = await prisma.streamer.findMany();

	for (const streamer of streamers) {
		const response = await axios.get(
			`https://api.twitch.tv/helix/streams?user_login=${streamer.twitchLogin}`,
			{
				headers: {
					"Client-ID": process.env.TWITCH_CLIENT_ID!,
					Authorization: `Bearer ${appAccessToken}`,
				},
			}
		);

		const userInfo = await axios.get(
			`https://api.twitch.tv/helix/users?login=${streamer.twitchLogin}`,
			{
				headers: {
					"Client-ID": process.env.TWITCH_CLIENT_ID!,
					Authorization: `Bearer ${appAccessToken}`,
				},
			}
		);

		const userData = userInfo.data.data[0];

		const isLiveNow = response.data.data.length > 0;

		if (!isLiveNow && streamer.isLive) {
			await prisma.streamer.update({
				where: { id: streamer.id },
				data: { isLive: false }
			});
			continue;
		}

		if (isLiveNow && !streamer.isLive) {
			const streamData = response.data.data[0];

			const guild = await client.guilds.fetch(streamer.guildId);
			const channel = config.NOTIFY_CHANNEL_ID
				? (guild.channels.cache.get(config.NOTIFY_CHANNEL_ID) as TextChannel)
				: guild.channels.cache.find(c => c.isTextBased()) as TextChannel;

			if (!channel) continue;

			const previewUrl = streamData.thumbnail_url
					.replace("{width}", "400")
					.replace("{height}", "225")
				+ `?t=${Date.now()}`; // добавляем timestamp для кэша

			// Embed с картинкой профиля
			const embed = new EmbedBuilder()
				.setTitle(`🔴 Стрим начался! ⸜(ˊᗜˋ)⸝`)
				.setURL(`https://www.twitch.tv/${streamer.twitchLogin}`)
				.setColor("#9146FF")
				.setThumbnail(userData.profile_image_url)
				.setImage(previewUrl)
				.addFields(
					{ name: "Тайтл", value: streamData.title || "Нет", inline: true },
					{ name: "Игра", value: streamData.game_name || "Нет", inline: true },
					{ name: "Зрители", value: `${streamData.viewer_count || 0}`, inline: true }
				)
				.setFooter({ text: `Twitch • ${streamer.twitchLogin}` });

			// Кнопка смотреть стрим
			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setLabel("Смотреть стрим")
						.setStyle(ButtonStyle.Link)
						.setURL(`https://www.twitch.tv/${streamer.twitchLogin}`)
				);

			await channel.send({
				content: `<@&${config.FAMILY_FAMQ_ROLE_ID}> <@${streamer.discordUserId}> начал(а) стрим!`,
				embeds: [embed],
				components: [row],
				allowedMentions: {
					roles: [config.FAMILY_FAMQ_ROLE_ID],
					users: [streamer.discordUserId],
				},
			});

			await prisma.streamer.update({
				where: { id: streamer.id },
				data: { isLive: true }
			});
		}
	}
}

export function startTwitchChecker(client: Client) {
	checkStreams(client).catch(console.error);
	setInterval(() => checkStreams(client).catch(console.error), 60_000);
}
