import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../utils/prisma";
import { checkRolesOrReply } from "../../utils/checkRoles";
import { DB_STAFF_ROLE_IDS } from "../../config/staff";
import { CUSTOM_COMMAND } from "../../constants/customIds";

const PAY_PER_HIVE = 50000;
const MONEYBAG_EMOJI = "💰";

function parseDiscordMessageLink(url: string) {
	const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
	if (!match) return null;

	return {
		guildId: match[1],
		channelId: match[2],
		messageId: match[3],
	};
}

export const hivePayoutCommand = {
	data: new SlashCommandBuilder()
		.setName(CUSTOM_COMMAND.DB_HIVE_PAYOUT)
		.setDescription("Сформировать выплаты по уликам"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply().catch(() => {});

		if (!(await checkRolesOrReply(interaction, DB_STAFF_ROLE_IDS))) return;

		const guild = interaction.guild;
		if (!guild) {
			return interaction.editReply("❌ Команда доступна только на сервере.");
		}

		const hives = await prisma.hive.findMany({
			where: {
				logUrl: {
					not: null,
				},
				isPaid: false,
			},
			orderBy: {
				createdAt: "asc",
			},
		});

		if (!hives.length) {
			return interaction.editReply("❌ Нет улик для выплаты.");
		}

		const grouped = new Map<
			string,
			{
				name: string;
				links: string[];
				hiveIds: bigint[];
			}
		>();

		for (const hive of hives) {
			if (!hive.logUrl) continue;

			const parsed = parseDiscordMessageLink(hive.logUrl);

			if (parsed) {
				try {
					const channel = await interaction.client.channels.fetch(parsed.channelId);

					if (channel?.isTextBased() && "messages" in channel) {
						const message = await channel.messages.fetch(parsed.messageId);
						await message.react(MONEYBAG_EMOJI).catch(() => {});
					}
				} catch {
					// игнорируем, если сообщение не найдено или нет доступа
				}
			}

			let displayName = `Unknown User (${hive.userId})`;

			try {
				const member = await guild.members.fetch(hive.userId);
				displayName = member.displayName;
			} catch {
				try {
					const user = await interaction.client.users.fetch(hive.userId);
					displayName = user.username;
				} catch {
					// оставляем Unknown User
				}
			}

			if (!grouped.has(hive.userId)) {
				grouped.set(hive.userId, {
					name: displayName,
					links: [],
					hiveIds: [],
				});
			}

			const item = grouped.get(hive.userId)!;
			item.links.push(hive.logUrl);
			item.hiveIds.push(hive.id);
		}

		let totalSum = 0;
		const parts: string[] = [];
		const paidHiveIds: bigint[] = [];

		for (const [, userData] of grouped) {
			const count = userData.links.length;
			const sum = count * PAY_PER_HIVE;
			totalSum += sum;
			paidHiveIds.push(...userData.hiveIds);

			const linksText = userData.links
				.map((link, index) => `${index + 1}. ${link}`)
				.join("\n");

			parts.push(
				`${userData.name}\n${linksText}\nСумма: ${count} * ${PAY_PER_HIVE} = ${sum}`
			);
		}

		if (paidHiveIds.length) {
			await prisma.hive.updateMany({
				where: {
					id: {
						in: paidHiveIds,
					},
				},
				data: {
					isPaid: true,
				},
			});
		}

		const finalText = `${parts.join("\n\n")}\n\nИтого: ${totalSum}`;

		if (finalText.length <= 1900) {
			return interaction.editReply(finalText);
		}

		const chunks: string[] = [];
		let buffer = "";

		for (const part of parts) {
			const text = `${part}\n\n`;
			if ((buffer + text).length > 1800) {
				chunks.push(buffer);
				buffer = text;
			} else {
				buffer += text;
			}
		}

		if (buffer) chunks.push(buffer);

		await interaction.editReply(chunks[0] || "✅ Выплаты сформированы.");

		for (let i = 1; i < chunks.length; i++) {
			await interaction.followUp({
				content: chunks[i],
			}).catch(() => {});
		}

		await interaction.followUp({
			content: `Итого: ${totalSum}`,
		}).catch(() => {});
	},
};
