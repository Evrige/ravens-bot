// src/services/googleDocs.ts
import { google } from "googleapis";
import { prisma } from "../utils/prisma";
import { config } from "../config/env";
import { hexToRuColorName } from "../utils/getColorToText";

/* ===================== AUTH ===================== */

function getOAuthClient() {
	const clientId = config.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = config.GOOGLE_CLIENT_SECRET?.trim();
	const redirectUri = config.GOOGLE_REDIRECT_URI?.trim();
	const refreshToken = config.GOOGLE_REFRESH_TOKEN?.trim();

	if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
	if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
	if (!redirectUri) throw new Error("GOOGLE_REDIRECT_URI is not set");
	if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN is not set");

	const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

	oauth2Client.setCredentials({
		refresh_token: refreshToken,
	});

	return oauth2Client;
}

function buildDocUrl(docId: string) {
	return `https://docs.google.com/document/d/${docId}/edit`;
}

function replaceText(placeholder: string, value: string) {
	return {
		replaceAllText: {
			containsText: { text: placeholder, matchCase: true },
			replaceText: value,
		},
	};
}

/* ===================== STORY ===================== */

function extractStartLine(text: string) {
	const firstLine = (text || "").split("\n")[0]?.trim() ?? "";
	return firstLine.replace(/^Начало записи\s*[:\-]?\s*/i, "").trim();
}

function buildStoryBody(text: string) {
	const lines = (text || "").split("\n");
	lines.shift();

	if ((lines[0] || "").trim().match(/^0:00\s*-\s*Начало записи$/i)) {
		lines.shift();
	}

	return lines.join("\n").trim();
}

/* ===================== SELECT HIVES ===================== */

type HiveWithForm = {
	story: string;
	link?: string | null;
	form: "ONE_HALF" | "ONE_QUARTER" | "ONE_FIFTH";
};

function selectHives(hives: HiveWithForm[]) {
	const halves = hives.filter((h) => h.form === "ONE_HALF").slice(0, 2);
	const quarters = hives.filter((h) => h.form === "ONE_QUARTER").slice(0, 4);
	let fifths = hives.filter((h) => h.form === "ONE_FIFTH").slice(0, 5);

	if (fifths.length < 5) {
		const needed = 5 - fifths.length;
		const extraQuarters = hives
			.filter((h) => h.form === "ONE_QUARTER")
			.slice(4, 4 + needed);

		fifths = [...fifths, ...extraQuarters];
	}

	return [...halves, ...quarters, ...fifths].slice(0, 11);
}

/* ===================== BUILD BLOCK WITH MARKERS ===================== */

const PROOF_WORD = "Доказательства";
const SEP = "\n\n";

function openTag(i: number) {
	return `[[PROOF_${i}]]`;
}

function closeTag(i: number) {
	return `[[/PROOF_${i}]]`;
}

function normalizeUrl(raw: string | null | undefined): string | null {
	const u = (raw || "").trim();
	if (!u) return null;
	if (/^https?:\/\//i.test(u)) return u;
	return `https://${u.replace(/^\/+/, "")}`;
}

function buildHivesBlockAndLinks(hives: HiveWithForm[]) {
	const selected = selectHives(hives);

	const linksInOrder: Array<string | null> = selected.map((h) => normalizeUrl(h.link));

	const block = selected
		.map((h, index) => {
			const part = index + 1;
			const dt = extractStartLine(h.story) || "-";
			const body = buildStoryBody(h.story) || "-";
			const proofLine = `2. ${openTag(index)}${PROOF_WORD}${closeTag(index)}`;

			return [`Часть ${part}.`, `1. ${dt}`, proofLine, `3. ${body}`].join("\n");
		})
		.join(SEP);

	return { block, linksInOrder };
}

/* ===================== DOC WALK ===================== */

type Range = { startIndex: number; endIndex: number };

function walkStructuralElements(elements: any[], cb: (paragraph: any) => void) {
	if (!Array.isArray(elements)) return;

	for (const el of elements) {
		if (!el) continue;

		if (el.paragraph) {
			cb(el.paragraph);
			continue;
		}

		if (el.table) {
			const rows = el.table.tableRows || [];
			for (const row of rows) {
				const cells = row.tableCells || [];
				for (const cell of cells) {
					walkStructuralElements(cell.content || [], cb);
				}
			}
			continue;
		}

		if (el.tableOfContents) {
			walkStructuralElements(el.tableOfContents.content || [], cb);
		}
	}
}

function paragraphToTextAndMap(paragraph: any) {
	let text = "";
	const posToDocIndex: number[] = [];

	const elements = paragraph?.elements || [];
	for (const el of elements) {
		const content: string | undefined = el?.textRun?.content;
		const startIndex: number | undefined = el?.startIndex;

		if (typeof content !== "string" || typeof startIndex !== "number") continue;

		for (let i = 0; i < content.length; i++) {
			text += content[i];
			posToDocIndex.push(startIndex + i);
		}
	}

	return { text, posToDocIndex };
}

function docToFullTextAndMap(doc: any) {
	let text = "";
	const posToDocIndex: number[] = [];

	const root = doc?.body?.content || [];
	walkStructuralElements(root, (p) => {
		const elements = p?.elements || [];
		for (const el of elements) {
			const contentStr: string | undefined = el?.textRun?.content;
			const startIndex: number | undefined = el?.startIndex;

			if (typeof contentStr !== "string" || typeof startIndex !== "number") continue;

			for (let i = 0; i < contentStr.length; i++) {
				text += contentStr[i];
				posToDocIndex.push(startIndex + i);
			}
		}
	});

	return { text, posToDocIndex };
}

function getDocumentEndIndex(doc: any): number {
	let maxEnd = 1;

	const root = doc?.body?.content || [];
	walkStructuralElements(root, (p) => {
		const elements = p?.elements || [];
		for (const el of elements) {
			const endIndex: number | undefined = el?.endIndex;
			if (typeof endIndex === "number" && endIndex > maxEnd) {
				maxEnd = endIndex;
			}
		}
	});

	return maxEnd;
}

/* ===================== FIND RANGES ===================== */

function findTaggedProofWordRanges(doc: any, count: number): Array<Range | null> {
	const out: Array<Range | null> = Array.from({ length: count }, () => null);

	const { text, posToDocIndex } = docToFullTextAndMap(doc);
	if (!text || !posToDocIndex.length) return out;

	for (let i = 0; i < count; i++) {
		const ot = openTag(i);
		const ct = closeTag(i);

		const openPos = text.indexOf(ot);
		if (openPos === -1) continue;

		const closePos = text.indexOf(ct, openPos + ot.length);
		if (closePos === -1) continue;

		const wordStartPos = openPos + ot.length;
		const wordEndPos = closePos;

		if (
			wordStartPos >= 0 &&
			wordEndPos > wordStartPos &&
			wordEndPos - 1 < posToDocIndex.length
		) {
			const startIndex = posToDocIndex[wordStartPos];
			const endIndex = posToDocIndex[wordEndPos - 1] + 1;
			out[i] = { startIndex, endIndex };
		}
	}

	return out;
}

function findPartHeadingRanges(doc: any): Range[] {
	const ranges: Range[] = [];
	const root = doc?.body?.content || [];

	walkStructuralElements(root, (p) => {
		const { text, posToDocIndex } = paragraphToTextAndMap(p);
		if (!text.startsWith("Часть ")) return;

		const nl = text.indexOf("\n");
		const endPos = nl >= 0 ? nl : text.length;

		if (endPos <= 0 || endPos - 1 >= posToDocIndex.length) return;

		ranges.push({
			startIndex: posToDocIndex[0],
			endIndex: posToDocIndex[endPos - 1] + 1,
		});
	});

	return ranges;
}

/* ===================== APPLY STYLES ===================== */

async function applyStylesAndLinks(
	docsApi: any,
	documentId: string,
	linksInOrder: Array<string | null>,
) {
	const docRes = await docsApi.documents.get({ documentId });
	const doc = docRes.data;

	const endIndex = getDocumentEndIndex(doc);
	const requests: any[] = [];

	requests.push({
		updateTextStyle: {
			range: { startIndex: 1, endIndex: Math.max(2, endIndex - 1) },
			textStyle: {
				weightedFontFamily: { fontFamily: "Georgia" },
				fontSize: { magnitude: 14, unit: "PT" },
			},
			fields: "weightedFontFamily,fontSize",
		},
	});

	for (const r of findPartHeadingRanges(doc)) {
		requests.push({
			updateTextStyle: {
				range: { startIndex: r.startIndex, endIndex: r.endIndex },
				textStyle: { bold: true },
				fields: "bold",
			},
		});
	}

	const proofRanges = findTaggedProofWordRanges(doc, linksInOrder.length);

	for (let i = 0; i < proofRanges.length; i++) {
		const r = proofRanges[i];
		const url = linksInOrder[i];
		if (!r || !url) continue;

		requests.push({
			updateTextStyle: {
				range: { startIndex: r.startIndex, endIndex: r.endIndex },
				textStyle: { link: { url }, underline: true },
				fields: "link,underline",
			},
		});
	}

	if (requests.length) {
		await docsApi.documents.batchUpdate({
			documentId,
			requestBody: { requests },
		});
	}

	const cleanup: any[] = [];
	for (let i = 0; i < linksInOrder.length; i++) {
		cleanup.push(replaceText(openTag(i), ""));
		cleanup.push(replaceText(closeTag(i), ""));
	}

	if (cleanup.length) {
		await docsApi.documents.batchUpdate({
			documentId,
			requestBody: { requests: cleanup },
		});
	}
}

/* ===================== PERMISSIONS ===================== */

async function setAnyoneWithLinkReader(driveApi: any, fileId: string) {
	await driveApi.permissions.create({
		fileId,
		requestBody: {
			type: "anyone",
			role: "reader",
		},
		fields: "id",
		supportsAllDrives: true,
	});
}

/* ===================== MAIN ===================== */

export async function createCaseDocument(params: {
	orgId: bigint;
	caseNumber: number | string;
	hiveIds: bigint[];
}) {
	const auth = getOAuthClient();
	const drive = google.drive({ version: "v3", auth });
	const docs = google.docs({ version: "v1", auth });

	const org = await prisma.organisation.findUnique({
		where: { id: params.orgId },
		select: { id: true, name: true, subject: true, adress: true, color: true },
	});
	if (!org) throw new Error("Организация не найдена");

	const hives = await prisma.hive.findMany({
		where: {
			id: { in: params.hiveIds },
			organisationId: params.orgId,
		},
		orderBy: { id: "asc" },
		select: { id: true, story: true, link: true, form: true },
	});

	if (hives.length !== params.hiveIds.length) {
		throw new Error("Часть улик не найдена");
	}

	const { block: hivesBlock, linksInOrder } = buildHivesBlockAndLinks(hives as any);

	const caseNumberStr = String(params.caseNumber).trim();
	const docName = `SD | PHX №0${caseNumberStr}`;

	const copy = await drive.files.copy({
		fileId: config.GOOGLE_TEMPLATE_DOC_ID,
		requestBody: {
			name: docName,
			parents: [config.GOOGLE_CASES_FOLDER_ID],
		},
		fields: "id,name",
		supportsAllDrives: true,
	});

	const docId = copy.data.id;
	if (!docId) throw new Error("Ошибка создания документа");

	try {
		await setAnyoneWithLinkReader(drive, docId);
	} catch (e: any) {
		console.error("[googleDocs] setAnyoneWithLinkReader failed:", e?.message ?? e);
	}

	const requests: any[] = [];
	requests.push(replaceText("{{CASE_NUMBER}}", `SD | PHX №0${caseNumberStr}`));
	requests.push(replaceText("{{ORG_NAME}}", org.name));
	requests.push(replaceText("{{ORG_SUBJECT}}", org.subject ?? "-"));
	requests.push(replaceText("{{ORG_ADDRESS}}", org.adress ?? "-"));
	requests.push(replaceText("{{ORG_COLOR}}", `${hexToRuColorName(org.color)}`));
	requests.push(replaceText("{{HIVES_BLOCK}}", hivesBlock));

	await docs.documents.batchUpdate({
		documentId: docId,
		requestBody: { requests },
	});

	await applyStylesAndLinks(docs, docId, linksInOrder);

	return {
		docId,
		url: buildDocUrl(docId),
		name: docName,
	};
}