export const DB_STAFF_ROLE_IDS =
	process.env.DB_STAFF_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_RECRUIT_ROLE_IDS =
	process.env.FAMILY_RECRUIT_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_HIGH_ROLE_IDS =
	process.env.FAMILY_HIGH_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_USER_ROLE_IDS =
	process.env.FAMILY_USER_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_OWNERS_ROLE_IDS =
	process.env.FAMILY_OWNERS_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_OWNER_ROLE_IDS =
	process.env.FAMILY_OWNER_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_LONDEST_ROLE_IDS =
	process.env.FAMILY_LONDEST_ROLE_IDS?.split(",").map(id => id.trim()) || [];

export const FAMILY_STAFF_LIST_ROLE_IDS =
	process.env.FAMILY_STAFF_LIST_ROLE_IDS?.split(",").map(id => id.trim()) || [];
