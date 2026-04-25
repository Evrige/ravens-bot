import { prisma } from "../utils/prisma";

export type ImprovementRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type AfkRecordStatus = "ACTIVE" | "ENDED" | "EXPIRED";
export type MarketOrderStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "DECLINED";
export type RankHistoryAction = "PROMOTE" | "DEMOTE";

export type ImprovementRequestRecord = {
	id: bigint;
	userId: string;
	requestKey: string;
	label: string;
	content: string;
	applicantUsername: string | null;
	applicantDisplayName: string | null;
	applicantRegisteredAt: Date | null;
	applicantJoinedAt: Date | null;
	status: ImprovementRequestStatus;
	createdAt: Date;
	updatedAt: Date;
	reviewedAt: Date | null;
	reviewedById: string | null;
	declineReason: string | null;
	messageId: string | null;
	channelId: string | null;
	messageUrl: string | null;
};

export type AfkRecord = {
	id: bigint;
	userId: string;
	reason: string;
	status: AfkRecordStatus;
	startedAt: Date;
	endAt: Date;
	closedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type MarketOrderRecord = {
	id: bigint;
	sellingId: bigint | null;
	userId: string;
	marketId: bigint | null;
	marketName: string;
	marketPrice: unknown;
	status: MarketOrderStatus;
	createdAt: Date;
	updatedAt: Date;
	takenById: string | null;
	takenAt: Date | null;
	resolvedById: string | null;
	resolvedAt: Date | null;
	declineReason: string | null;
	logMessageId: string | null;
	logChannelId: string | null;
};

export type RankHistoryRecord = {
	id: bigint;
	userId: string;
	action: RankHistoryAction;
	rankKey: string;
	rankLabel: string;
	targetRoleId: string | null;
	targetRoleName: string | null;
	beforeRanks: string | null;
	afterRanks: string | null;
	reason: string | null;
	moderatorId: string;
	source: string;
	relatedImprovementRequestId: bigint | null;
	applicantUsername: string | null;
	applicantDisplayName: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type CountRow = {
	status: string;
	total: bigint;
};

function isMissingFamilyHistoryTableError(error: unknown) {
	const prismaError = error as {
		code?: string;
		meta?: { driverAdapterError?: { cause?: { code?: string } } };
		message?: string;
	};

	return prismaError?.code === "P2010"
		&& (
			prismaError?.meta?.driverAdapterError?.cause?.code === "42P01"
			|| prismaError?.message?.includes(`relation "AfkRecord" does not exist`)
			|| prismaError?.message?.includes(`relation "MarketOrder" does not exist`)
			|| prismaError?.message?.includes(`relation "ImprovementRequest" does not exist`)
			|| prismaError?.message?.includes(`relation "RankHistory" does not exist`)
			|| prismaError?.message?.includes(`отношение "AfkRecord" не существует`)
			|| prismaError?.message?.includes(`отношение "MarketOrder" не существует`)
			|| prismaError?.message?.includes(`отношение "ImprovementRequest" не существует`)
			|| prismaError?.message?.includes(`отношение "RankHistory" не существует`)
		);
}

export async function createImprovementRequest(input: {
	userId: string;
	requestKey: string;
	label: string;
	content: string;
	applicantUsername?: string | null;
	applicantDisplayName?: string | null;
	applicantRegisteredAt?: Date | null;
	applicantJoinedAt?: Date | null;
}) {
	try {
		const [row] = await prisma.$queryRaw<ImprovementRequestRecord[]>`
			INSERT INTO "ImprovementRequest" (
				"userId",
				"requestKey",
				"label",
				"content",
				"applicantUsername",
				"applicantDisplayName",
				"applicantRegisteredAt",
				"applicantJoinedAt",
				"status",
				"createdAt",
				"updatedAt"
			)
			VALUES (
				${input.userId},
				${input.requestKey},
				${input.label},
				${input.content},
				${input.applicantUsername ?? null},
				${input.applicantDisplayName ?? null},
				${input.applicantRegisteredAt ?? null},
				${input.applicantJoinedAt ?? null},
				'PENDING'::"ImprovementRequestStatus",
				NOW(),
				NOW()
			)
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function setImprovementRequestMessage(
	id: bigint,
	message: { channelId: string; messageId: string; messageUrl: string }
) {
	try {
		const [row] = await prisma.$queryRaw<ImprovementRequestRecord[]>`
			UPDATE "ImprovementRequest"
			SET
				"channelId" = ${message.channelId},
				"messageId" = ${message.messageId},
				"messageUrl" = ${message.messageUrl},
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function listRecentImprovementRequests(userId: string, limit = 5) {
	try {
		return await prisma.$queryRaw<ImprovementRequestRecord[]>`
			SELECT *
			FROM "ImprovementRequest"
			WHERE "userId" = ${userId}
			ORDER BY "createdAt" DESC
			LIMIT ${limit}
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function getImprovementRequest(id: bigint) {
	try {
		const [row] = await prisma.$queryRaw<ImprovementRequestRecord[]>`
			SELECT *
			FROM "ImprovementRequest"
			WHERE "id" = ${id}
			LIMIT 1
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function acceptImprovementRequest(id: bigint, reviewedById: string) {
	try {
		const [row] = await prisma.$queryRaw<ImprovementRequestRecord[]>`
			UPDATE "ImprovementRequest"
			SET
				"status" = 'ACCEPTED'::"ImprovementRequestStatus",
				"reviewedAt" = NOW(),
				"reviewedById" = ${reviewedById},
				"declineReason" = NULL,
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			  AND "status" = 'PENDING'::"ImprovementRequestStatus"
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function declineImprovementRequest(
	id: bigint,
	reviewedById: string,
	reason: string
) {
	try {
		const [row] = await prisma.$queryRaw<ImprovementRequestRecord[]>`
			UPDATE "ImprovementRequest"
			SET
				"status" = 'DECLINED'::"ImprovementRequestStatus",
				"reviewedAt" = NOW(),
				"reviewedById" = ${reviewedById},
				"declineReason" = ${reason},
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			  AND "status" = 'PENDING'::"ImprovementRequestStatus"
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function getImprovementStats(userId: string) {
	let rows: CountRow[] = [];
	try {
		rows = await prisma.$queryRaw<CountRow[]>`
			SELECT "status", COUNT(*)::bigint AS "total"
			FROM "ImprovementRequest"
			WHERE "userId" = ${userId}
			GROUP BY "status"
		`;
	} catch (error) {
		if (!isMissingFamilyHistoryTableError(error)) throw error;
	}

	return {
		total: rows.reduce((sum, row) => sum + Number(row.total), 0),
		pending: Number(rows.find((row) => row.status === "PENDING")?.total ?? 0n),
		accepted: Number(rows.find((row) => row.status === "ACCEPTED")?.total ?? 0n),
		declined: Number(rows.find((row) => row.status === "DECLINED")?.total ?? 0n),
	};
}

export async function createRankHistoryEntry(input: {
	userId: string;
	action: RankHistoryAction;
	rankKey: string;
	rankLabel: string;
	targetRoleId?: string | null;
	targetRoleName?: string | null;
	beforeRanks?: string | null;
	afterRanks?: string | null;
	reason?: string | null;
	moderatorId: string;
	source: string;
	relatedImprovementRequestId?: bigint | null;
	applicantUsername?: string | null;
	applicantDisplayName?: string | null;
}) {
	try {
		const [row] = await prisma.$queryRaw<RankHistoryRecord[]>`
			INSERT INTO "RankHistory" (
				"userId",
				"action",
				"rankKey",
				"rankLabel",
				"targetRoleId",
				"targetRoleName",
				"beforeRanks",
				"afterRanks",
				"reason",
				"moderatorId",
				"source",
				"relatedImprovementRequestId",
				"applicantUsername",
				"applicantDisplayName",
				"createdAt",
				"updatedAt"
			)
			VALUES (
				${input.userId},
				${input.action},
				${input.rankKey},
				${input.rankLabel},
				${input.targetRoleId ?? null},
				${input.targetRoleName ?? null},
				${input.beforeRanks ?? null},
				${input.afterRanks ?? null},
				${input.reason ?? null},
				${input.moderatorId},
				${input.source},
				${input.relatedImprovementRequestId ?? null},
				${input.applicantUsername ?? null},
				${input.applicantDisplayName ?? null},
				NOW(),
				NOW()
			)
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function listRankHistoryByUser(userId: string, limit = 50) {
	try {
		return await prisma.$queryRaw<RankHistoryRecord[]>`
			SELECT *
			FROM "RankHistory"
			WHERE "userId" = ${userId}
			ORDER BY "createdAt" DESC
			LIMIT ${limit}
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function getActiveAfkRecord(userId: string) {
	try {
		const [row] = await prisma.$queryRaw<AfkRecord[]>`
			SELECT *
			FROM "AfkRecord"
			WHERE "userId" = ${userId}
			  AND "status" = 'ACTIVE'::"AfkRecordStatus"
			ORDER BY "createdAt" DESC
			LIMIT 1
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function listActiveAfkRecords() {
	try {
		return await prisma.$queryRaw<AfkRecord[]>`
			SELECT *
			FROM "AfkRecord"
			WHERE "status" = 'ACTIVE'::"AfkRecordStatus"
			ORDER BY "endAt" ASC
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function createAfkRecord(input: {
	userId: string;
	reason: string;
	startedAt: Date;
	endAt: Date;
}) {
	try {
		const [row] = await prisma.$queryRaw<AfkRecord[]>`
			INSERT INTO "AfkRecord" (
				"userId",
				"reason",
				"status",
				"startedAt",
				"endAt",
				"createdAt",
				"updatedAt"
			)
			VALUES (
				${input.userId},
				${input.reason},
				'ACTIVE'::"AfkRecordStatus",
				${input.startedAt},
				${input.endAt},
				NOW(),
				NOW()
			)
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function endActiveAfkRecord(userId: string, status: Extract<AfkRecordStatus, "ENDED" | "EXPIRED">) {
	try {
		const [row] = await prisma.$queryRaw<AfkRecord[]>`
			UPDATE "AfkRecord"
			SET
				"status" = ${status}::"AfkRecordStatus",
				"closedAt" = NOW(),
				"updatedAt" = NOW()
			WHERE "id" = (
				SELECT "id"
				FROM "AfkRecord"
				WHERE "userId" = ${userId}
				  AND "status" = 'ACTIVE'::"AfkRecordStatus"
				ORDER BY "createdAt" DESC
				LIMIT 1
			)
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function expireDueAfkRecords(now = new Date()) {
	try {
		return await prisma.$queryRaw<AfkRecord[]>`
			UPDATE "AfkRecord"
			SET
				"status" = 'EXPIRED'::"AfkRecordStatus",
				"closedAt" = NOW(),
				"updatedAt" = NOW()
			WHERE "status" = 'ACTIVE'::"AfkRecordStatus"
			  AND "endAt" <= ${now}
			RETURNING *
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function getLatestAfkRecord(userId: string) {
	try {
		const [row] = await prisma.$queryRaw<AfkRecord[]>`
			SELECT *
			FROM "AfkRecord"
			WHERE "userId" = ${userId}
			ORDER BY "createdAt" DESC
			LIMIT 1
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function createMarketOrder(input: {
	sellingId: bigint;
	userId: string;
	marketId: bigint;
	marketName: string;
	marketPrice: unknown;
}) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			INSERT INTO "MarketOrder" (
				"sellingId",
				"userId",
				"marketId",
				"marketName",
				"marketPrice",
				"status",
				"createdAt",
				"updatedAt"
			)
			VALUES (
				${input.sellingId},
				${input.userId},
				${input.marketId},
				${input.marketName},
				${input.marketPrice},
				'PENDING'::"MarketOrderStatus",
				NOW(),
				NOW()
			)
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function setMarketOrderLogMessage(
	id: bigint,
	message: { channelId: string; messageId: string }
) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			UPDATE "MarketOrder"
			SET
				"logChannelId" = ${message.channelId},
				"logMessageId" = ${message.messageId},
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function getMarketOrder(id: bigint) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			SELECT *
			FROM "MarketOrder"
			WHERE "id" = ${id}
			LIMIT 1
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function takeMarketOrder(id: bigint, takenById: string) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			UPDATE "MarketOrder"
			SET
				"status" = 'IN_PROGRESS'::"MarketOrderStatus",
				"takenById" = ${takenById},
				"takenAt" = NOW(),
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			  AND "status" = 'PENDING'::"MarketOrderStatus"
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function completeMarketOrder(id: bigint, resolvedById: string) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			UPDATE "MarketOrder"
			SET
				"status" = 'COMPLETED'::"MarketOrderStatus",
				"resolvedById" = ${resolvedById},
				"resolvedAt" = NOW(),
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			  AND "status" IN (
			  	'PENDING'::"MarketOrderStatus",
			  	'IN_PROGRESS'::"MarketOrderStatus"
			  )
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function declineMarketOrder(id: bigint, resolvedById: string, reason?: string) {
	try {
		const [row] = await prisma.$queryRaw<MarketOrderRecord[]>`
			UPDATE "MarketOrder"
			SET
				"status" = 'DECLINED'::"MarketOrderStatus",
				"resolvedById" = ${resolvedById},
				"resolvedAt" = NOW(),
				"declineReason" = ${reason ?? null},
				"updatedAt" = NOW()
			WHERE "id" = ${id}
			  AND "status" IN (
			  	'PENDING'::"MarketOrderStatus",
			  	'IN_PROGRESS'::"MarketOrderStatus"
			  )
			RETURNING *
		`;

		return row ?? null;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return null;
		throw error;
	}
}

export async function listOpenMarketOrders(limit = 25) {
	try {
		return await prisma.$queryRaw<MarketOrderRecord[]>`
			SELECT *
			FROM "MarketOrder"
			WHERE "status" IN (
				'PENDING'::"MarketOrderStatus",
				'IN_PROGRESS'::"MarketOrderStatus"
			)
			ORDER BY
				CASE WHEN "status" = 'IN_PROGRESS'::"MarketOrderStatus" THEN 0 ELSE 1 END,
				"createdAt" ASC
			LIMIT ${limit}
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function listRecentMarketOrdersByUser(userId: string, limit = 5) {
	try {
		return await prisma.$queryRaw<MarketOrderRecord[]>`
			SELECT *
			FROM "MarketOrder"
			WHERE "userId" = ${userId}
			ORDER BY "createdAt" DESC
			LIMIT ${limit}
		`;
	} catch (error) {
		if (isMissingFamilyHistoryTableError(error)) return [];
		throw error;
	}
}

export async function getMarketOrderStats(userId: string) {
	let rows: CountRow[] = [];
	try {
		rows = await prisma.$queryRaw<CountRow[]>`
			SELECT "status", COUNT(*)::bigint AS "total"
			FROM "MarketOrder"
			WHERE "userId" = ${userId}
			GROUP BY "status"
		`;
	} catch (error) {
		if (!isMissingFamilyHistoryTableError(error)) throw error;
	}

	return {
		total: rows.reduce((sum, row) => sum + Number(row.total), 0),
		pending: Number(rows.find((row) => row.status === "PENDING")?.total ?? 0n),
		inProgress: Number(rows.find((row) => row.status === "IN_PROGRESS")?.total ?? 0n),
		completed: Number(rows.find((row) => row.status === "COMPLETED")?.total ?? 0n),
		declined: Number(rows.find((row) => row.status === "DECLINED")?.total ?? 0n),
	};
}
