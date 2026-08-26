import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	Client,
	ChannelType,
	ForumChannel,
	ThreadChannel,
} from "discord.js";
import {prisma} from "../../utils/prisma";
import {CUSTOM_COMMAND} from "../../constants/customIds";
import {FAMILY_PANEL, upsertFamilyListPanel} from "../../services/upsertFamilyListPanel";
import {FACTION_PANEL, upsertFactionListPanel} from "../../services/upsertFactionListPanel";
import {config} from "../../config/env";

export const familyPanelReset = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.FAMILY_PANEL)
		.setDescription("Пересоздать панели семей и фракций"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const family = await resetFamilyPanel(interaction.client);
		const faction = await resetFactionPanel(interaction.client);

		await interaction.editReply(
			[
				family.ok ? "✅ Панель семей пересоздана" : `❌ Панель семей: ${family.reason}`,
				faction.ok ? "✅ Панель фракций пересоздана" : `❌ Панель фракций: ${faction.reason}`,
			].join("\n")
		);
	},
};

async function deletePanelMessages(client: Client, mainType: string, chunkPrefix: string) {
	const rows = await prisma.botMessage.findMany({
		where: {
			OR: [
				{ type: mainType },
				{ type: { startsWith: chunkPrefix } },
			],
		},
	});

	for (const row of rows) {
		const ch = await client.channels.fetch(row.channelId).catch(() => null);
		if (!ch?.isTextBased()) continue;

		const msg = await ch.messages.fetch(row.messageId).catch(() => null);
		if (msg) await msg.delete().catch(() => null);
	}

	await prisma.botMessage.deleteMany({
		where: {
			OR: [
				{ type: mainType },
				{ type: { startsWith: chunkPrefix } },
			],
		},
	});
}

async function findPanelThread(client: Client, forumId: string, threadName: string) {
	const channel = await client.channels.fetch(forumId).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildForum) return null;

	const forum = channel as ForumChannel;

	const active = await forum.threads.fetchActive().catch(() => null);
	const activeThread = active?.threads.find((thread) => thread.name === threadName);
	if (activeThread) return activeThread as ThreadChannel;

	const archived = await forum.threads.fetchArchived({ type: "public", fetchAll: true }).catch(() => null);
	const archivedThread = archived?.threads.find((thread) => thread.name === threadName);
	if (!archivedThread) return null;

	const thread = archivedThread as ThreadChannel;
	await thread.setArchived(false).catch(() => null);
	await thread.setLocked(false).catch(() => null);
	return thread;
}

async function deleteOrphanPanelMessages(client: Client, forumId: string, threadName: string) {
	const thread = await findPanelThread(client, forumId, threadName);
	if (!thread) return;

	const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
	if (!messages) return;

	for (const message of messages.values()) {
		if (message.author.id !== client.user?.id) continue;
		if (!message.components.length) continue;
		await message.delete().catch(() => null);
	}
}

export async function resetFamilyPanel(client: Client) {
	await deletePanelMessages(client, FAMILY_PANEL.BOTMSG_TYPE, FAMILY_PANEL.MULTI_PREFIX);
	await deleteOrphanPanelMessages(client, config.DB_FORUM_FAMILY_ID, FAMILY_PANEL.THREAD_NAME);
	return await upsertFamilyListPanel(client);
}

export async function resetFactionPanel(client: Client) {
	await deletePanelMessages(client, FACTION_PANEL.BOTMSG_TYPE, FACTION_PANEL.MULTI_PREFIX);
	await deleteOrphanPanelMessages(client, config.DB_FORUM_FRACTION_ID, FACTION_PANEL.THREAD_NAME);
	return await upsertFactionListPanel(client);
}
