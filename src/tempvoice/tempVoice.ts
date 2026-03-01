// src/tempvoice/tempVoice.ts
import {
	ChannelType,
	Client,
	Guild,
	GuildMember,
	PermissionFlagsBits,
	VoiceChannel,
	VoiceState,
} from "discord.js";
import { IDS } from "./ids";
import {ensureTempVoicePanel} from "./ensurePanel";
import {buildLimitModal, buildRenameModal, buildUserSelect} from "./ui";
import {config} from "../config/env";

type TempInfo = {
	guildId: string;
	channelId: string;
	ownerId: string;
};


export function initTempVoice(client: Client) {
	const NAME_PREFIX = "🔊";


	const tempsByChannel = new Map<string, TempInfo>();
	const tempsByOwner = new Map<string, TempInfo>();

	// 1) панель всегда одна — создаём/обновляем на старте
	const runEnsurePanel = async () => {
		for (const [, guild] of client.guilds.cache) {
			await ensureTempVoicePanel(guild, config.TEMP_VOICE_PANEL_TEXT_ID);
		}
	};

	if (client.isReady()) runEnsurePanel().catch(console.error);
	else client.once("ready", () => runEnsurePanel().catch(console.error));

	// ===== voice create/delete =====

	async function createTemp(member: GuildMember) {
		const guild = member.guild;

		// если уже есть temp — просто перенести
		const existing = tempsByOwner.get(member.id);
		if (existing) {
			const ch = await guild.channels.fetch(existing.channelId).catch(() => null);
			if (ch && ch.type === ChannelType.GuildVoice) {
				await member.voice.setChannel(ch.id).catch(() => null);
			}
			return;
		}

		const overwrites = [
			{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
			{
				id: member.id,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.Connect,
					PermissionFlagsBits.Speak,
					PermissionFlagsBits.Stream,
					PermissionFlagsBits.UseVAD,
					PermissionFlagsBits.MoveMembers,
					PermissionFlagsBits.ManageChannels,
				],
			},
		];

		const channel = await guild.channels.create({
			name: `${NAME_PREFIX} ${member.displayName}`,
			type: ChannelType.GuildVoice,
			parent: config.TEMP_VOICE_CATEGORY_ID,
			permissionOverwrites: overwrites,
		});

		const info: TempInfo = { guildId: guild.id, channelId: channel.id, ownerId: member.id };
		tempsByChannel.set(channel.id, info);
		tempsByOwner.set(member.id, info);

		await member.voice.setChannel(channel.id).catch(() => null);
	}

	async function deleteTemp(channelId: string, reason: string) {
		const info = tempsByChannel.get(channelId);
		if (!info) return;

		tempsByChannel.delete(channelId);
		tempsByOwner.delete(info.ownerId);

		const guild = await client.guilds.fetch(info.guildId).catch(() => null);
		if (!guild) return;

		const ch = await guild.channels.fetch(channelId).catch(() => null);
		if (ch && ch.type === ChannelType.GuildVoice) {
			await ch.delete(`TempVoice: ${reason}`).catch(() => null);
		}
	}

	async function handleVoice(oldState: VoiceState, newState: VoiceState) {
		// вошёл в JTC
		if (newState.channelId === config.TEMP_VOICE_JTC_VOICE_ID && newState.member) {
			await createTemp(newState.member);
			return;
		}

		// вышел из temp -> удалить если пустой
		if (oldState.channelId && tempsByChannel.has(oldState.channelId)) {
			const ch = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);
			if (ch && ch.type === ChannelType.GuildVoice) {
				const vc = ch as VoiceChannel;
				if (vc.members.size === 0) await deleteTemp(vc.id, "empty");
			}
		}
	}

	client.on("voiceStateUpdate", (o, n) => {
		handleVoice(o, n).catch((e) => console.error("[tempVoice] voiceStateUpdate error", e));
	});

	// ===== helpers for actions =====

	function getUserVoiceChannelId(interaction: any): string | null {
		// interaction.member is GuildMember in guild
		return interaction.member?.voice?.channelId ?? null;
	}

	async function fetchVoice(guild: Guild, channelId: string): Promise<VoiceChannel | null> {
		const ch = await guild.channels.fetch(channelId).catch(() => null);
		if (!ch || ch.type !== ChannelType.GuildVoice) return null;
		return ch as VoiceChannel;
	}

	function isOwner(userId: string, channelId: string) {
		const info = tempsByChannel.get(channelId);
		return !!info && info.ownerId === userId;
	}

	function isTemp(channelId: string) {
		return tempsByChannel.has(channelId);
	}

	async function togglePrivacy(guild: Guild, vc: VoiceChannel) {
		const everyone = guild.roles.everyone.id;
		const ow = vc.permissionOverwrites.cache.get(everyone);
		const isPrivate = ow?.deny?.has(PermissionFlagsBits.Connect) ?? false;

		if (isPrivate) {
			await vc.permissionOverwrites.edit(everyone, { Connect: true, ViewChannel: true });
			return "public";
		} else {
			await vc.permissionOverwrites.edit(everyone, { Connect: false });
			return "private";
		}
	}

	async function trustUser(vc: VoiceChannel, userId: string) {
		await vc.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true, Speak: true });
	}

	async function inviteUser(vc: VoiceChannel, userId: string) {
		await vc.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true });
	}

	async function resetUser(vc: VoiceChannel, userId: string) {
		await vc.permissionOverwrites.delete(userId).catch(() => null);
	}

	async function blockUser(guild: Guild, vc: VoiceChannel, userId: string) {
		await vc.permissionOverwrites.edit(userId, { Connect: false, ViewChannel: false });
		const m = await guild.members.fetch(userId).catch(() => null);
		if (m?.voice.channelId === vc.id) await m.voice.disconnect().catch(() => null);
	}

	async function kickUser(guild: Guild, vc: VoiceChannel, userId: string) {
		const m = await guild.members.fetch(userId).catch(() => null);
		if (m?.voice.channelId === vc.id) await m.voice.disconnect().catch(() => null);
	}

	async function transferOwner(vc: VoiceChannel, oldOwnerId: string, newOwnerId: string) {
		await vc.permissionOverwrites.edit(oldOwnerId, { ManageChannels: false, MoveMembers: false }).catch(() => null);
		await vc.permissionOverwrites.edit(newOwnerId, {
			Connect: true,
			ViewChannel: true,
			Speak: true,
			ManageChannels: true,
			MoveMembers: true,
		});
	}

	// ===== interactions (buttons/selects/modals) =====

	client.on("interactionCreate", async (interaction) => {
		try {
			// важно: чтобы TS не ругался на reply/update/showModal
			if (!interaction.isButton() && !interaction.isUserSelectMenu() && !interaction.isModalSubmit()) return;
			if (!interaction.customId.startsWith(IDS.PREFIX)) return;

			const voiceChannelId = getUserVoiceChannelId(interaction);
			if (!voiceChannelId) {
				await interaction.reply({ ephemeral: true, content: "Зайди в voice-канал, чтобы использовать панель." });
				return;
			}

			if (!isTemp(voiceChannelId)) {
				await interaction.reply({ ephemeral: true, content: "Это не временный voice-канал." });
				return;
			}

			const vc = await fetchVoice(interaction.guild!, voiceChannelId);
			if (!vc) {
				await interaction.reply({ ephemeral: true, content: "Не удалось получить voice-канал." });
				return;
			}

			const info = tempsByChannel.get(voiceChannelId)!;

			// кнопка CLAIM — отдельное правило (можно нажать не владельцу)
			if (interaction.isButton() && interaction.customId === IDS.BTN_CLAIM) {
				// Можно “забрать”, если текущего владельца нет в канале
				const ownerStillHere = vc.members.has(info.ownerId);
				if (ownerStillHere) {
					await interaction.reply({ ephemeral: true, content: "Владелец сейчас в канале — claim недоступен." });
					return;
				}

				tempsByOwner.delete(info.ownerId);
				info.ownerId = interaction.user.id;
				tempsByOwner.set(interaction.user.id, info);

				await vc.permissionOverwrites.edit(interaction.user.id, {
					Connect: true,
					ViewChannel: true,
					Speak: true,
					ManageChannels: true,
					MoveMembers: true,
				});

				await interaction.reply({ ephemeral: true, content: "👑 Ты стал владельцем этого temp-канала." });
				return;
			}

			// остальное — только владельцу
			if (info.ownerId !== interaction.user.id) {
				await interaction.reply({ ephemeral: true, content: "Управлять может только владелец своего temp-канала." });
				return;
			}

			// ===== Buttons =====
			if (interaction.isButton()) {
				switch (interaction.customId) {
					case IDS.BTN_NAME:
						await interaction.showModal(buildRenameModal());
						return;

					case IDS.BTN_LIMIT:
						await interaction.showModal(buildLimitModal());
						return;

					case IDS.BTN_PRIVACY: {
						const state = await togglePrivacy(interaction.guild!, vc);
						await interaction.reply({ ephemeral: true, content: `Готово: канал теперь **${state}**.` });
						return;
					}

					case IDS.BTN_WAIT:
						await interaction.reply({ ephemeral: true, content: "WAITING ROOM: можно дореализовать очередью/ожиданием." });
						return;

					case IDS.BTN_CHAT:
						await interaction.reply({ ephemeral: true, content: "CHAT: можно дореализовать авто-текст/тред под voice." });
						return;

					case IDS.BTN_REGION:
						await interaction.reply({ ephemeral: true, content: "REGION: в Discord сейчас ограничено. Можно сделать UX-замену." });
						return;

					case IDS.BTN_TRUST:
						await interaction.reply({
							ephemeral: true,
							content: "TRUST кого?",
							components: [buildUserSelect(IDS.SEL_TRUST, "Select user")],
						});
						return;

					case IDS.BTN_UNTRUST:
						await interaction.reply({
							ephemeral: true,
							content: "UNTRUST кого?",
							components: [buildUserSelect(IDS.SEL_UNTRUST, "Select user")],
						});
						return;

					case IDS.BTN_INVITE:
						await interaction.reply({
							ephemeral: true,
							content: "INVITE кого?",
							components: [buildUserSelect(IDS.SEL_INVITE, "Select user")],
						});
						return;

					case IDS.BTN_KICK:
						await interaction.reply({
							ephemeral: true,
							content: "KICK кого?",
							components: [buildUserSelect(IDS.SEL_KICK, "Select user")],
						});
						return;

					case IDS.BTN_BLOCK:
						await interaction.reply({
							ephemeral: true,
							content: "BLOCK кого?",
							components: [buildUserSelect(IDS.SEL_BLOCK, "Select user")],
						});
						return;

					case IDS.BTN_UNBLOCK:
						await interaction.reply({
							ephemeral: true,
							content: "UNBLOCK кого?",
							components: [buildUserSelect(IDS.SEL_UNBLOCK, "Select user")],
						});
						return;

					case IDS.BTN_TRANSFER:
						await interaction.reply({
							ephemeral: true,
							content: "TRANSFER кому?",
							components: [buildUserSelect(IDS.SEL_TRANSFER, "Select new owner")],
						});
						return;

					case IDS.BTN_DELETE:
						await interaction.reply({ ephemeral: true, content: "Удаляю канал..." });
						await deleteTemp(voiceChannelId, "deleted by owner");
						return;

					default:
						await interaction.reply({ ephemeral: true, content: "Неизвестная кнопка." });
						return;
				}
			}

			// ===== Select menus =====
			if (interaction.isUserSelectMenu()) {
				const userId = interaction.values[0];

				switch (interaction.customId) {
					case IDS.SEL_TRUST:
						await trustUser(vc, userId);
						await interaction.update({ content: `✅ TRUST: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_UNTRUST:
						await resetUser(vc, userId);
						await interaction.update({ content: `🚫 UNTRUST: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_INVITE:
						await inviteUser(vc, userId);
						await interaction.update({ content: `✉️ INVITE: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_KICK:
						await kickUser(interaction.guild!, vc, userId);
						await interaction.update({ content: `👢 KICK: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_BLOCK:
						await blockUser(interaction.guild!, vc, userId);
						await interaction.update({ content: `⛔ BLOCK: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_UNBLOCK:
						await resetUser(vc, userId);
						await interaction.update({ content: `🔓 UNBLOCK: <@${userId}>`, components: [] });
						return;

					case IDS.SEL_TRANSFER: {
						const oldOwner = info.ownerId;
						await transferOwner(vc, oldOwner, userId);

						tempsByOwner.delete(oldOwner);
						info.ownerId = userId;
						tempsByOwner.set(userId, info);

						await interaction.update({ content: `🔁 TRANSFER: новый владелец <@${userId}>`, components: [] });
						return;
					}

					default:
						await interaction.reply({ ephemeral: true, content: "Неизвестное меню." });
						return;
				}
			}

			// ===== Modals =====
			if (interaction.isModalSubmit()) {
				if (interaction.customId === IDS.MODAL_NAME) {
					const name = interaction.fields.getTextInputValue("name").trim();
					if (!name) {
						await interaction.reply({ ephemeral: true, content: "Имя не может быть пустым." });
						return;
					}
					await vc.setName(name);
					await interaction.reply({ ephemeral: true, content: `🏷️ NAME: **${name}**` });
					return;
				}

				if (interaction.customId === IDS.MODAL_LIMIT) {
					const raw = interaction.fields.getTextInputValue("limit").trim();
					const limit = Number(raw);
					if (!Number.isFinite(limit) || limit < 0 || limit > 99) {
						await interaction.reply({ ephemeral: true, content: "LIMIT должен быть числом 0..99." });
						return;
					}
					await vc.setUserLimit(limit);
					await interaction.reply({ ephemeral: true, content: `👥 LIMIT: **${limit}**` });
					return;
				}
			}
		} catch (e) {
			console.error("[tempVoice] interaction error", e);
			if (interaction.isRepliable()) {
				await interaction.reply({ ephemeral: true, content: "TempVoice error." }).catch(() => null);
			}
		}
	});

}