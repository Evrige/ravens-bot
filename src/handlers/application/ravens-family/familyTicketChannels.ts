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

async function collectFamilyTicketChannels(guild: Guild, userId: string) {
	const channels = await fetchRecruitCategoryChannels(guild);
	const textChannels: TextChannel[] = [];
	const voiceChannels: VoiceChannel[] = [];
	const member = await guild.members.fetch(userId).catch(() => null);
	const usernameSlug = member ? sanitizeChannelSlug(member.user.username) : null;

	for (const channel of channels.values()) {
		if (!channel || channel.parentId !== config.FAMILY_RECRUIT_CATEGORY_ID) continue;
		if (!("permissionOverwrites" in channel)) continue;

		const userOverwrite = channel.permissionOverwrites.cache.get(userId);
		const hasUserAccess = !!userOverwrite?.allow.has(PermissionFlagsBits.ViewChannel);
		const textTopicMatches =
			channel.type === ChannelType.GuildText &&
			((channel as TextChannel).topic ?? "").includes(`family-application-user:${userId}`);
		const nameMatches = !!usernameSlug && (
			channel.name === `чат-${usernameSlug}` ||
			channel.name === `обзвон-${usernameSlug}`
		);

		if (!hasUserAccess && !textTopicMatches && !nameMatches) continue;

		if (channel.type === ChannelType.GuildText && channel.name.startsWith("чат-")) {
			textChannels.push(channel as TextChannel);
		}

		if (channel.type === ChannelType.GuildVoice && channel.name.startsWith("обзвон-")) {
			voiceChannels.push(channel as VoiceChannel);
		}
	}

	return { textChannels, voiceChannels };
}

export async function findFamilyTicketChannels(guild: Guild, userId: string) {
	const { textChannels, voiceChannels } = await collectFamilyTicketChannels(guild, userId);

	const textChannel = textChannels[0] ?? null;
	const voiceChannel = voiceChannels[0] ?? null;

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

	if (textChannel.type === ChannelType.GuildText) {
		await (textChannel as TextChannel).setTopic(`family-application-user:${params.userId}`).catch(() => {});
	}

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
	const { textChannels, voiceChannels } = await collectFamilyTicketChannels(guild, userId);

	for (const textChannel of textChannels) {
		await textChannel.delete("Заявка обработана").catch(() => {});
	}

	for (const voiceChannel of voiceChannels) {
		await voiceChannel.delete("Заявка обработана").catch(() => {});
	}
}
