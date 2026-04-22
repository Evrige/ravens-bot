import {
	ChannelType,
	Guild,
	PermissionFlagsBits,
	TextChannel,
	VoiceChannel,
} from "discord.js";
import { config } from "../../../config/env";
import { createPrivateChannel } from "../../../utils/createPrivateChannel";

function sanitizeChannelSlug(value: string) {
	return (
		value
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9а-яё_-]/gi, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 70) || "user"
	);
}

async function fetchRecruitCategoryChannels(guild: Guild) {
	return await guild.channels.fetch().catch(() => guild.channels.cache);
}

export async function findFamilyTicketChannels(guild: Guild, userId: string) {
	const channels = await fetchRecruitCategoryChannels(guild);
	let textChannel: TextChannel | null = null;
	let voiceChannel: VoiceChannel | null = null;

	for (const channel of channels.values()) {
		if (!channel || channel.parentId !== config.FAMILY_RECRUIT_CATEGORY_ID) continue;
		if (!("permissionOverwrites" in channel)) continue;

		const userOverwrite = channel.permissionOverwrites.cache.get(userId);
		if (!userOverwrite?.allow.has(PermissionFlagsBits.ViewChannel)) continue;

		if (channel.type === ChannelType.GuildText && channel.name.startsWith("чат-")) {
			textChannel = channel as TextChannel;
		}

		if (channel.type === ChannelType.GuildVoice && channel.name.startsWith("обзвон-")) {
			voiceChannel = channel as VoiceChannel;
		}
	}

	return { textChannel, voiceChannel };
}

export async function ensureFamilyTicketChannels(params: {
	guild: Guild;
	username: string;
	userId: string;
	clickedUserId: string;
	roleIds: string[];
}) {
	const existing = await findFamilyTicketChannels(params.guild, params.userId);
	const slug = sanitizeChannelSlug(params.username);

	const textChannel =
		existing.textChannel ??
		(await createPrivateChannel({
			guild: params.guild,
			name: `чат-${slug}`,
			type: ChannelType.GuildText,
			categoryId: config.FAMILY_RECRUIT_CATEGORY_ID!,
			userId: params.userId,
			clickedUserId: params.clickedUserId,
			roleIds: params.roleIds,
		}));

	const voiceChannel =
		existing.voiceChannel ??
		(await createPrivateChannel({
			guild: params.guild,
			name: `обзвон-${slug}`,
			type: ChannelType.GuildVoice,
			categoryId: config.FAMILY_RECRUIT_CATEGORY_ID!,
			userId: params.userId,
			clickedUserId: params.clickedUserId,
			roleIds: params.roleIds,
		}));

	return {
		textChannel: textChannel.type === ChannelType.GuildText ? (textChannel as TextChannel) : null,
		voiceChannel: voiceChannel.type === ChannelType.GuildVoice ? (voiceChannel as VoiceChannel) : null,
	};
}

export async function deleteFamilyTicketChannels(guild: Guild, userId: string) {
	const { textChannel, voiceChannel } = await findFamilyTicketChannels(guild, userId);

	if (textChannel) {
		await textChannel.delete("Заявка обработана").catch(() => {});
	}

	if (voiceChannel) {
		await voiceChannel.delete("Заявка обработана").catch(() => {});
	}
}
