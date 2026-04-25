import {
	AttachmentBuilder,
	ChannelType,
	Client,
	MessageFlags,
	TextChannel,
} from "discord.js";
import { CHANNEL_IDS } from "../config/channels";
import { config } from "../config/env";

const V2 = {
	Container: 17,
	TextDisplay: 10,
	MediaGallery: 12,
	Separator: 14,
} as const;

import path from "path";

const SERVER_NAME = "LONDO";
const WELCOME_FILE_NAME = "londo.png";
const WELCOME_FILE_PATH = path.join(process.cwd(), "assets", "londo.png");

function formatWelcomeTime(date = new Date()) {
	return new Intl.DateTimeFormat("ru-RU", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "Europe/Kiev",
	}).format(date);
}

function buildWelcomeContainer(memberMention: string, memberName: string, memberCount: number) {
	return {
		type: V2.Container,
		components: [
			{
				type: V2.TextDisplay,
				content: memberMention,
			},
			{
				type: V2.TextDisplay,
				content: `**${memberName}**\n♱ присоединился к серверу`,
			},
			{
				type: V2.TextDisplay,
				content: `Подавай заявку <#${CHANNEL_IDS.FAMILY_APPLICATION}>`,
			},
			{ type: V2.Separator },
			{
				type: V2.MediaGallery,
				items: [
					{
						media: { url: `attachment://${WELCOME_FILE_NAME}` },
						description: "Welcome",
					},
				],
			},
			{
				type: V2.TextDisplay,
				content: `Всего участников - ${memberCount} | Сегодня, в ${formatWelcomeTime()}`,
			},
		],
	};
}

export function startFamilyWelcomeNotifier(client: Client) {
	client.on("guildMemberAdd", async (member) => {
		if (member.guild.id !== config.FAMILY_SERVER_GUID) return;

		const welcomeChannel = await member.guild.channels.fetch(CHANNEL_IDS.FAMILY_WELCOME).catch(() => null);
		if (!welcomeChannel || welcomeChannel.type !== ChannelType.GuildText) {
			return;
		}

		const memberName = member.displayName || member.user.globalName || member.user.username;
		const container = buildWelcomeContainer(`${member}`, memberName, member.guild.memberCount);

		await (welcomeChannel as TextChannel).send({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			files: [new AttachmentBuilder(WELCOME_FILE_PATH, { name: WELCOME_FILE_NAME })],
		}).catch((error) => {
			console.error("[family-welcome] failed to send welcome message:", error);
		});
	});
}
