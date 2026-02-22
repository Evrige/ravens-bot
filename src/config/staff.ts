export const DB_STAFF_ROLE_IDS =
	process.env.DB_STAFF_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_RECRUIT_ROLE_IDS =
	process.env.FAMILY_RECRUIT_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_HIGH_ROLE_IDS =
	process.env.FAMILY_HIGH_ROLE_IDS?.split(",").map(id => id.trim()) || [];
