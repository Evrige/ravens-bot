import { Guild, GuildMember } from "discord.js";
import { prisma } from "../utils/prisma";
import { FAMILY_RECRUIT_ROLE_IDS } from "../config/staff";

export type RecruitPerformanceStats = {
	recruitId: string;
	total: number;
	accepted: number;
	declined: number;
	pending: number;
	callTaken: number;
	totalWeek: number;
	acceptedWeek: number;
	declinedWeek: number;
	pendingWeek: number;
	callTakenWeek: number;
	conversion: number;
	conversionWeek: number;
};

type ApplicationRow = {
	recruitId: string | null;
	callTakenById: string | null;
	isAccepted: boolean | null;
	createdAt: Date;
};

export async function getActiveRecruitMembers(guild: Guild) {
	const applications = await prisma.application.findMany({
		where: {
			OR: [
				{ recruitId: { not: null } },
				{ callTakenById: { not: null } },
			],
		},
		select: {
			recruitId: true,
			callTakenById: true,
			isAccepted: true,
			createdAt: true,
		},
	});

	const candidateIds = Array.from(
		new Set(
			applications.flatMap((application) =>
				[application.recruitId, application.callTakenById].filter(
					(id): id is string => Boolean(id)
				)
			)
		)
	);

	if (!candidateIds.length) {
		return {
			members: [] as GuildMember[],
			applications,
		};
	}

	const members = await Promise.all(
		candidateIds.map((id) => guild.members.fetch(id).catch(() => null))
	);

	const activeMembers = members.filter(
		(member): member is GuildMember => {
			if (!member) return false;
			return FAMILY_RECRUIT_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
		}
	);

	return {
		members: activeMembers,
		applications,
	};
}

export function buildRecruitPerformanceStats(
	recruitIds: string[],
	applications: ApplicationRow[]
) {
	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const initial: Record<string, RecruitPerformanceStats> = {};

	for (const recruitId of recruitIds) {
		initial[recruitId] = {
			recruitId,
			total: 0,
			accepted: 0,
			declined: 0,
			pending: 0,
			callTaken: 0,
			totalWeek: 0,
			acceptedWeek: 0,
			declinedWeek: 0,
			pendingWeek: 0,
			callTakenWeek: 0,
			conversion: 0,
			conversionWeek: 0,
		};
	}

	for (const application of applications) {
		const isWeekly = application.createdAt >= weekAgo;

		if (application.recruitId && initial[application.recruitId]) {
			const stats = initial[application.recruitId];
			stats.total += 1;

			if (application.isAccepted === true) stats.accepted += 1;
			else if (application.isAccepted === false) stats.declined += 1;
			else stats.pending += 1;

			if (isWeekly) {
				stats.totalWeek += 1;
				if (application.isAccepted === true) stats.acceptedWeek += 1;
				else if (application.isAccepted === false) stats.declinedWeek += 1;
				else stats.pendingWeek += 1;
			}
		}

		if (application.callTakenById && initial[application.callTakenById]) {
			const stats = initial[application.callTakenById];
			stats.callTaken += 1;

			if (isWeekly) {
				stats.callTakenWeek += 1;
			}
		}
	}

	for (const stats of Object.values(initial)) {
		const resolved = stats.accepted + stats.declined;
		const resolvedWeek = stats.acceptedWeek + stats.declinedWeek;

		stats.conversion = resolved ? (stats.accepted / resolved) * 100 : 0;
		stats.conversionWeek = resolvedWeek ? (stats.acceptedWeek / resolvedWeek) * 100 : 0;
	}

	return Object.values(initial);
}
