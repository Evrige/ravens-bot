import { Guild, ChannelType, PermissionFlagsBits } from "discord.js";

interface CreatePrivateChannelOptions {
	guild: Guild;
	name: string;
	type: ChannelType.GuildText | ChannelType.GuildVoice;
	categoryId: string;
	userId: string;
	clickedUserId: string;
	roleIds: string[];
	userLimit?: number;
}

export async function createPrivateChannel({
																			guild,
																			name,
																			type,
																			categoryId,
																						 userId,
																			clickedUserId,
																			roleIds,
																			userLimit,
																		}: CreatePrivateChannelOptions) {
	const isSnowflake = (value: string | undefined | null) => /^\d{17,20}$/.test(value ?? "");
	const validRoleIds = roleIds
		.filter((roleId) => isSnowflake(roleId))
		.filter((roleId) => guild.roles.cache.has(roleId));

	const overwrites = [
		{
			id: guild.roles.everyone.id,
			deny: [PermissionFlagsBits.ViewChannel],
		},
		{
			id: userId,
			allow: [
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ReadMessageHistory,
				PermissionFlagsBits.Connect,
				PermissionFlagsBits.Speak,
			],
		},
		{
			id: clickedUserId,
			allow: [
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ReadMessageHistory,
				PermissionFlagsBits.Connect,
				PermissionFlagsBits.Speak,
			],
		},
		...validRoleIds.map(roleId => ({
			id: roleId,
			allow: [
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ReadMessageHistory,
				PermissionFlagsBits.Connect,
				PermissionFlagsBits.Speak,
			],
		})),
	];

	return guild.channels.create({
		name,
		type,
		parent: categoryId,
		userLimit, // undefined если не нужен лимит
		permissionOverwrites: overwrites,
	});
}
