import { Guild, GuildMember } from "discord.js";

export type FamilyRankKey =
	| "newbie"
	| "plum"
	| "young_londo"
	| "londo"
	| "main"
	| "maecenas"
	| "recruit"
	| "high_staff";

type FamilyRankDefinition = {
	label: string;
	aliases: string[];
	kind: "hierarchy" | "badge";
};

export const FAMILY_RANKS: Record<FamilyRankKey, FamilyRankDefinition> = {
	newbie: {
		label: "Newbie",
		aliases: ["Newbie"],
		kind: "hierarchy",
	},
	plum: {
		label: "Baby Londo",
		aliases: ["Baby Londo", "Plum"],
		kind: "hierarchy",
	},
	young_londo: {
		label: "Young Ravens",
		aliases: ["Young Ravens", "Young Londo"],
		kind: "hierarchy",
	},
	londo: {
		label: "Ravens",
		aliases: ["Ravens", "Londo"],
		kind: "hierarchy",
	},
	main: {
		label: "Main",
		aliases: ["Main"],
		kind: "hierarchy",
	},
	maecenas: {
		label: "Londest Londo",
		aliases: ["Londest Londo", "Maecenas"],
		kind: "badge",
	},
	recruit: {
		label: "Recruit",
		aliases: ["Recruit"],
		kind: "badge",
	},
	high_staff: {
		label: "High Staff",
		aliases: ["High Staff"],
		kind: "badge",
	},
};

export const FAMILY_RANK_CHOICES: Array<{ name: string; value: FamilyRankKey }> = [
	{ name: "Newbie", value: "newbie" },
	{ name: "Baby Londo", value: "plum" },
	{ name: "Young Ravens", value: "young_londo" },
	{ name: "Ravens", value: "londo" },
	{ name: "Main", value: "main" },
	{ name: "Londest Londo", value: "maecenas" },
	{ name: "Recruit", value: "recruit" },
	{ name: "High Staff", value: "high_staff" },
];

const FAMILY_HIERARCHY_KEYS: FamilyRankKey[] = [
	"newbie",
	"plum",
	"young_londo",
	"londo",
	"main",
];

function normalizeName(name: string) {
	return name.trim().toLowerCase();
}

export function getFamilyRankLabel(rankKey: FamilyRankKey) {
	return FAMILY_RANKS[rankKey].label;
}

export function findFamilyRankRole(guild: Guild, rankKey: FamilyRankKey) {
	const aliases = FAMILY_RANKS[rankKey].aliases.map(normalizeName);

	return (
		guild.roles.cache.find((role) => aliases.includes(normalizeName(role.name))) ?? null
	);
}

export function getHierarchyRoleIds(guild: Guild) {
	return FAMILY_HIERARCHY_KEYS
		.map((rankKey) => findFamilyRankRole(guild, rankKey)?.id ?? null)
		.filter((roleId): roleId is string => Boolean(roleId));
}

export function getMemberFamilyRankLabels(member: GuildMember) {
	return FAMILY_RANK_CHOICES
		.filter(({ value }) => {
			const role = findFamilyRankRole(member.guild, value);
			return role ? member.roles.cache.has(role.id) : false;
		})
		.map(({ value }) => getFamilyRankLabel(value));
}

export async function applyFamilyRankChange(
	member: GuildMember,
	rankKey: FamilyRankKey,
	action: "PROMOTE" | "DEMOTE"
) {
	const definition = FAMILY_RANKS[rankKey];
	const targetRole = findFamilyRankRole(member.guild, rankKey);

	if (!targetRole) {
		return null;
	}

	const beforeRanks = getMemberFamilyRankLabels(member);

	if (definition.kind === "hierarchy") {
		const hierarchyRoleIds = getHierarchyRoleIds(member.guild).filter((roleId) =>
			member.roles.cache.has(roleId)
		);

		const rolesToRemove = hierarchyRoleIds.filter((roleId) => roleId !== targetRole.id);
		if (rolesToRemove.length) {
			await member.roles.remove(rolesToRemove).catch(() => {});
		}

		if (!member.roles.cache.has(targetRole.id)) {
			await member.roles.add(targetRole.id).catch(() => {});
		}
	} else if (action === "PROMOTE") {
		if (!member.roles.cache.has(targetRole.id)) {
			await member.roles.add(targetRole.id).catch(() => {});
		}
	} else if (member.roles.cache.has(targetRole.id)) {
		await member.roles.remove(targetRole.id).catch(() => {});
	}

	await member.fetch(true).catch(() => {});

	const afterRanks = getMemberFamilyRankLabels(member);

	return {
		rankKey,
		rankLabel: definition.label,
		targetRoleId: targetRole.id,
		targetRoleName: targetRole.name,
		beforeRanks,
		afterRanks,
		changed:
			beforeRanks.join(" | ") !== afterRanks.join(" | "),
	};
}
