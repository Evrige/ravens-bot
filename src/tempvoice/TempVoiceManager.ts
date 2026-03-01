// src/tempvoice/TempVoiceManager.ts
import {
	ChannelType,
	Client,
	Guild,
	GuildMember,
	PermissionFlagsBits,
	TextChannel,
	VoiceChannel,
	VoiceState,
} from "discord.js";
import { buildPanelComponents, buildPanelEmbed } from "./ui";
import {config} from "../config/env";

type TempInfo = {
	ownerId: string;
	channelId: string;
	guildId: string;
	panelMessageId?: string;
	textChannelId?: string;
};

export class TempVoiceManager {
	private client: Client;
	private tempsByChannel = new Map<string, TempInfo>();
	private tempsByOwner = new Map<string, TempInfo>();

	constructor(client: Client) {
		this.client = client;
	}

	isTempChannel(channelId: string) {
		return this.tempsByChannel.has(channelId);
	}

	getByOwner(ownerId: string) {
		return this.tempsByOwner.get(ownerId);
	}

	getByChannel(channelId: string) {
		return this.tempsByChannel.get(channelId);
	}

	private async getControlTextChannel(guild: Guild): Promise<TextChannel | null> {
		const ch = await guild.channels.fetch(config.TEMP_VOICE_PANEL_TEXT_ID).catch(() => null);
		if (!ch || ch.type !== ChannelType.GuildText) return null;
		return ch as TextChannel;
	}

	async createTempFor(member: GuildMember) {
		const guild = member.guild;

		const overwrites = [
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.Connect],
			},
			{
				id: member.id,
				allow: [
					PermissionFlagsBits.Connect,
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.Speak,
					PermissionFlagsBits.Stream,
					PermissionFlagsBits.UseVAD,
					PermissionFlagsBits.MoveMembers,
					PermissionFlagsBits.ManageChannels,
				],
			},
		];

		const channel = await guild.channels.create({
			name: `🔊 ${member.displayName}`,
			type: ChannelType.GuildVoice,
			parent: config.TEMP_VOICE_CATEGORY_ID,
			permissionOverwrites: overwrites,
		});

		const info: TempInfo = {
			ownerId: member.id,
			channelId: channel.id,
			guildId: guild.id,
			textChannelId: config.TEMP_VOICE_PANEL_TEXT_ID,
		};

		this.tempsByChannel.set(channel.id, info);
		this.tempsByOwner.set(member.id, info);

		// Перенести в новый канал
		await member.voice.setChannel(channel.id).catch(() => null);

		// Панель
		const control = await this.getControlTextChannel(guild);
		if (control) {
			const msg = await control.send({
				content: `Панель управления для <@${member.id}> (канал: <#${channel.id}>)`,
				embeds: [buildPanelEmbed()],
				components: buildPanelComponents(),
			});
			info.panelMessageId = msg.id;
		}
	}

	async deleteTempChannel(channelId: string, reason: string) {
		const info = this.tempsByChannel.get(channelId);
		if (!info) return;

		// убрать из мап
		this.tempsByChannel.delete(channelId);
		this.tempsByOwner.delete(info.ownerId);

		const guild = await this.client.guilds.fetch(info.guildId).catch(() => null);
		if (!guild) return;

		const ch = await guild.channels.fetch(channelId).catch(() => null);
		if (ch && ch.type === ChannelType.GuildVoice) {
			await ch.delete(`TempVoice: ${reason}`).catch(() => null);
		}
	}

	// ====== actions from UI ======

	async assertOwner(interactionUserId: string, channelId: string) {
		const info = this.getByChannel(channelId);
		return info?.ownerId === interactionUserId;
	}

	async rename(channelId: string, name: string) {
		const info = this.getByChannel(channelId);
		if (!info) return false;
		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;
		await ch.setName(name);
		return true;
	}

	async setLimit(channelId: string, limit: number) {
		const info = this.getByChannel(channelId);
		if (!info) return false;
		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;
		await (ch as VoiceChannel).setUserLimit(limit);
		return true;
	}

	async togglePrivacy(channelId: string) {
		const info = this.getByChannel(channelId);
		if (!info) return null;

		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return null;

		const vc = ch as VoiceChannel;
		const everyone = guild.roles.everyone.id;

		const current = vc.permissionOverwrites.cache.get(everyone);
		const isPrivate = current?.deny?.has(PermissionFlagsBits.Connect) ?? false;

		// если сейчас private (deny connect) -> сделать public (allow connect)
		// если public -> private (deny connect)
		if (isPrivate) {
			await vc.permissionOverwrites.edit(everyone, { Connect: true, ViewChannel: true });
			return "public";
		} else {
			await vc.permissionOverwrites.edit(everyone, { Connect: false });
			return "private";
		}
	}

	async trust(channelId: string, userId: string) {
		const info = this.getByChannel(channelId);
		if (!info) return false;

		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;

		const vc = ch as VoiceChannel;
		await vc.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true, Speak: true });
		return true;
	}

	async untrust(channelId: string, userId: string) {
		const info = this.getByChannel(channelId);
		if (!info) return false;

		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;

		const vc = ch as VoiceChannel;
		// убрать перс. пермишены (вернётся к @everyone)
		await vc.permissionOverwrites.delete(userId).catch(() => null);
		return true;
	}

	async block(channelId: string, userId: string) {
		const info = this.getByChannel(channelId);
		if (!info) return false;

		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;

		const vc = ch as VoiceChannel;
		await vc.permissionOverwrites.edit(userId, { Connect: false, ViewChannel: false });

		// если пользователь внутри — кикнуть
		const member = await guild.members.fetch(userId).catch(() => null);
		if (member?.voice.channelId === channelId) {
			await member.voice.disconnect().catch(() => null);
		}
		return true;
	}

	async unblock(channelId: string, userId: string) {
		return this.untrust(channelId, userId);
	}

	async transfer(channelId: string, newOwnerId: string) {
		const info = this.getByChannel(channelId);
		if (!info) return false;

		const guild = await this.client.guilds.fetch(info.guildId);
		const ch = await guild.channels.fetch(channelId);
		if (!ch || ch.type !== ChannelType.GuildVoice) return false;

		const vc = ch as VoiceChannel;

		// снять “управление” со старого владельца (можно оставить)
		await vc.permissionOverwrites.edit(info.ownerId, { ManageChannels: false, MoveMembers: false }).catch(() => null);

		// выдать новому
		await vc.permissionOverwrites.edit(newOwnerId, {
			Connect: true,
			ViewChannel: true,
			Speak: true,
			ManageChannels: true,
			MoveMembers: true,
		});

		// обновить мапы
		this.tempsByOwner.delete(info.ownerId);
		info.ownerId = newOwnerId;
		this.tempsByOwner.set(newOwnerId, info);
		return true;
	}
}