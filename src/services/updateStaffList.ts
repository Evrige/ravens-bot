import { Client, EmbedBuilder, Message, Channel } from "discord.js";
import { prisma } from "../utils/prisma";
import { FAMILY_STAFF_LIST_ROLE_IDS } from "../config/staff";

const TYPE_MAIN = "staff_list_main";
const TYPE_EXTRA = "staff_list_extra";

const ROLES_IN_FIRST_MESSAGE = 4;
const MAX_DESC = 4000;

const collapsedByChannel = new Map<string, boolean>();

function isSendableChannel(ch: Channel | null): ch is any {
	if (!ch) return false;
	if (typeof (ch as any).isSendable === "function") return (ch as any).isSendable();
	return typeof (ch as any).send === "function";
}

async function getRoleBlocksFromGuild(guild: NonNullable<Message["guild"]>) {
	const mentioned = new Set<string>();
	const blocks: { roleName: string; mentions: string[] }[] = [];

	for (const roleId of FAMILY_STAFF_LIST_ROLE_IDS) {
		const role = await guild.roles.fetch(roleId).catch(() => null);
		if (!role) continue;

		const members = role.members.filter((m) => !mentioned.has(m.id));
		if (members.size === 0) continue;

		const mentions: string[] = [];
		for (const m of members.values()) {
			mentions.push(`<@${m.id}>`);
			mentioned.add(m.id);
		}

		blocks.push({ roleName: role.name, mentions });
	}

	return blocks;
}

function buildEmbed(blocks: { roleName: string; mentions: string[] }[], collapsed: boolean) {
	const embed = new EmbedBuilder()
		.setTitle("🦅 Семья • STAFF")
		.setColor("Purple")
		.setFooter({ text: "Обновляется каждые 4 часа • by Evri" })
		.setTimestamp();

	if (!blocks.length) {
		embed.setDescription("Нет участников.");
		return embed;
	}

	let description = "";
	for (const b of blocks) {
		description += `## ${b.roleName.toUpperCase()} - ${b.mentions.length}\n`;
		if (!collapsed) description += b.mentions.join("\n") + "\n\n";
		else description += "\n";
	}

	if (description.length > MAX_DESC) {
		description = description.slice(0, MAX_DESC) + "\n\n_...список сокращён_";
	}

	embed.setDescription(description);
	return embed;
}

function buildToggleComponents(channelId: string, collapsed: boolean) {
	return [
		{
			type: 1,
			components: [
				{
					type: 2,
					style: 2,
					custom_id: `staff_toggle:${channelId}`,
					label: collapsed ? "Развернуть" : "Свернуть",
				},
			],
		} as any,
	];
}

/**
 * Гарантированно получает main message:
 * - если в БД есть и сообщение доступно -> fetch
 * - иначе -> создаёт новое в channelIdForCreate и пишет в БД
 */
async function getOrCreateMainMessage(client: Client, channelIdForCreate?: string): Promise<Message | null> {
	let mainRow = await prisma.botMessage.findUnique({ where: { type: TYPE_MAIN } });

	// если нет записи и не дали канал для создания — некуда обновлять
	if (!mainRow && !channelIdForCreate) return null;

	const channelId = mainRow?.channelId ?? channelIdForCreate!;
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!isSendableChannel(channel)) return null;

	// если запись есть — пробуем fetch
	if (mainRow) {
		const fetched = await (channel as any).messages.fetch(mainRow.messageId).catch(() => null);
		if (fetched) return fetched;
	}

	// иначе создаём новое
	const sent: Message = await (channel as any).send({
		embeds: [new EmbedBuilder().setColor("Purple").setDescription("Загрузка...")],
	});

	await prisma.botMessage.upsert({
		where: { type: TYPE_MAIN },
		update: { messageId: sent.id, channelId: sent.channelId },
		create: { type: TYPE_MAIN, messageId: sent.id, channelId: sent.channelId },
	});

	return sent;
}

async function getExtraMessage(client: Client, channelId: string): Promise<Message | null> {
	const row = await prisma.botMessage.findUnique({ where: { type: TYPE_EXTRA } });
	if (!row) return null;

	// если extra в другом канале — считаем битым
	if (row.channelId !== channelId) {
		await prisma.botMessage.delete({ where: { type: TYPE_EXTRA } }).catch(() => {});
		return null;
	}

	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!isSendableChannel(channel)) return null;

	const msg = await (channel as any).messages.fetch(row.messageId).catch(() => null);
	if (!msg) {
		await prisma.botMessage.delete({ where: { type: TYPE_EXTRA } }).catch(() => {});
		return null;
	}

	return msg;
}

async function upsertExtra(msg: Message) {
	await prisma.botMessage.upsert({
		where: { type: TYPE_EXTRA },
		update: { messageId: msg.id, channelId: msg.channelId },
		create: { type: TYPE_EXTRA, messageId: msg.id, channelId: msg.channelId },
	});
}

async function deleteExtra(client: Client) {
	const row = await prisma.botMessage.findUnique({ where: { type: TYPE_EXTRA } });
	if (!row) return;

	const channel = await client.channels.fetch(row.channelId).catch(() => null);
	if (isSendableChannel(channel)) {
		const msg = await (channel as any).messages.fetch(row.messageId).catch(() => null);
		if (msg) await msg.delete().catch(() => {});
	}

	await prisma.botMessage.delete({ where: { type: TYPE_EXTRA } }).catch(() => {});
}

/**
 * Аналог updateMarket:
 * - если сообщений нет -> при вызове из команды передай channelId, чтобы создать
 * - если уже есть -> обновит по БД
 */
export async function updateStaffList(client: Client, channelIdForCreate?: string) {
	const mainMsg = await getOrCreateMainMessage(client, channelIdForCreate);
	if (!mainMsg) return;

	const guild = mainMsg.guild;
	if (!guild) return;

	const channelId = mainMsg.channelId;

	const collapsed = collapsedByChannel.get(channelId) ?? false;

	const blocks = await getRoleBlocksFromGuild(guild);
	const first = blocks.slice(0, ROLES_IN_FIRST_MESSAGE);
	const rest = blocks.slice(ROLES_IN_FIRST_MESSAGE);

	await mainMsg.edit({
		embeds: [buildEmbed(first, collapsed)],
		components: buildToggleComponents(channelId, collapsed),
	}).catch(() => {
	});

	if (rest.length) {
		const existingExtra = await getExtraMessage(client, channelId);

		if (!existingExtra) {
			const ch = mainMsg.channel;

			// sendable check
			if (!isSendableChannel(ch as any)) return;

			const sent: Message = await (ch as any).send({
				embeds: [buildEmbed(rest, collapsed)],
			});

			await upsertExtra(sent);
		} else {
			await existingExtra.edit({
				embeds: [buildEmbed(rest, collapsed)],
			}).catch(() => {
			});
		}
	} else {
		await deleteExtra(client);
	}
}

async function deleteStored(type: string, client: Client) {
	const row = await prisma.botMessage.findUnique({ where: { type } });
	if (!row) return;

	const ch = await client.channels.fetch(row.channelId).catch(() => null);
	if (isSendableChannel(ch)) {
		const msg = await (ch as any).messages.fetch(row.messageId).catch(() => null);
		if (msg) await msg.delete().catch(() => {});
	}

	await prisma.botMessage.delete({ where: { type } }).catch(() => {});
}

/**
 * Командный “репост”:
 * - удаляет старые main/extra (если есть)
 * - создаёт новые в channelId
 * - пишет новые id в БД
 * - сразу обновляет содержимое (через updateStaffList)
 */
export async function repostStaffList(client: Client, channelId: string) {
	// 1) удалить старые сообщения/записи
	await deleteStored(TYPE_EXTRA, client);
	await deleteStored(TYPE_MAIN, client);

	// 2) создать пустышку main сразу (чтобы updateStaffList знал, что редактировать)
	const ch = await client.channels.fetch(channelId).catch(() => null);
	if (!isSendableChannel(ch)) return;

	const sentMain: Message = await (ch as any).send({
		embeds: [new EmbedBuilder().setColor("Purple").setDescription("Загрузка...")],
	});

	await prisma.botMessage.upsert({
		where: { type: TYPE_MAIN },
		update: { messageId: sentMain.id, channelId: sentMain.channelId },
		create: { type: TYPE_MAIN, messageId: sentMain.id, channelId: sentMain.channelId },
	});

	// 3) наполнить main и (если надо) создать extra
	await updateStaffList(client).catch(() => {});
}

/**
 * Кнопка "Свернуть/Развернуть"
 */
export async function handleStaffListToggle(client: Client, interaction: any) {
	if (!interaction.isButton()) return false;

	const [prefix, channelId] = interaction.customId.split(":");
	if (prefix !== "staff_toggle" || !channelId) return false;

	await interaction.deferUpdate().catch(() => {});

	const cur = collapsedByChannel.get(channelId) ?? false;
	collapsedByChannel.set(channelId, !cur);

	await updateStaffList(client).catch(() => {});
	return true;
}