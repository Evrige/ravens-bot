import { EmbedBuilder, Guild } from "discord.js";
import { FAMILY_RECRUIT_ROLE_IDS } from "../config/staff";
import { prisma } from "../utils/prisma";

type RecruitCounters = {
	accepted: number;
	total: number;
};

function createEmptyCountersMap(recruitIds: string[]) {
	return recruitIds.reduce<Record<string, RecruitCounters>>((acc, recruitId) => {
		acc[recruitId] = { accepted: 0, total: 0 };
		return acc;
	}, {});
}

async function getRecruitIds(guild: Guild) {
	await guild.members.fetch();

	return guild.members.cache
		.filter((member) =>
			FAMILY_RECRUIT_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))
		)
		.map((member) => member.id);
}

async function getCounters(recruitIds: string[], from?: Date) {
	if (!recruitIds.length) return createEmptyCountersMap([]);

	const applications = await prisma.application.findMany({
		where: {
			recruitId: { in: recruitIds },
			...(from ? { createdAt: { gte: from } } : {}),
		},
		select: {
			recruitId: true,
			isAccepted: true,
		},
	});

	const counters = createEmptyCountersMap(recruitIds);

	for (const application of applications) {
		if (!application.recruitId) continue;

		counters[application.recruitId].total += 1;
		if (application.isAccepted) {
			counters[application.recruitId].accepted += 1;
		}
	}

	return counters;
}

function formatStatsSection(
	title: string,
	recruitIds: string[],
	counters: Record<string, RecruitCounters>
) {
	const lines = recruitIds
		.map((recruitId) => ({
			recruitId,
			accepted: counters[recruitId]?.accepted ?? 0,
			total: counters[recruitId]?.total ?? 0,
		}))
		.sort((a, b) => {
			if (b.total !== a.total) return b.total - a.total;
			if (b.accepted !== a.accepted) return b.accepted - a.accepted;
			return a.recruitId.localeCompare(b.recruitId);
		})
		.map(
			(entry) =>
				`<@${entry.recruitId}> — Принято: ${entry.accepted} | Отклонено: ${entry.total - entry.accepted} | Всего: ${entry.total}`
		);

	return [
		`### ${title}`,
		lines.length ? lines.join("\n") : "Пока нет рекрутеров с нужными ролями.",
	].join("\n");
}

export async function buildRecruitStatsEmbed(guild: Guild) {
	const recruitIds = await getRecruitIds(guild);
	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [overallCounters, weeklyCounters] = await Promise.all([
		getCounters(recruitIds),
		getCounters(recruitIds, weekAgo),
	]);

	const description = [
		formatStatsSection("Общая статистика", recruitIds, overallCounters),
		formatStatsSection("За последнюю неделю", recruitIds, weeklyCounters),
	].join("\n\n");

	return new EmbedBuilder()
		.setTitle("📊 Статистика рекрутеров")
		.setColor("Blue")
		.setDescription(description)
		.setFooter({ text: "Только участники с recruit-ролями • by Evri" })
		.setTimestamp();
}
