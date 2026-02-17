export const STAFF_ROLE_IDS =
	process.env.STAFF_ROLE_IDS?.split(",").map(id => id.trim()) || [];
