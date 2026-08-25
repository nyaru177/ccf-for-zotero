import { JournalIdentityCandidate } from "./casTypes";

const journalIdentityFields = [
  "publicationTitle",
  "journalAbbreviation",
  "ISSN",
  "extra",
];

function getField(item: Zotero.Item, field: string): string {
  try {
    const value = item.getField(field);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export function normalizeISSN(value: string): string | undefined {
  const compact = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!/^[0-9]{7}[0-9X]$/.test(compact)) return undefined;
  return compact;
}

export function extractISSNs(value: string): string[] {
  const candidates = value.match(/[0-9]{4}[-\s]?[0-9]{3}[0-9Xx]/g) || [];
  return [
    ...new Set(
      candidates
        .map((candidate) => normalizeISSN(candidate))
        .filter((candidate): candidate is string => Boolean(candidate)),
    ),
  ];
}

export function normalizeJournalTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/\b(the|journal of)\b/gi, " ")
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getJournalInputFingerprint(item: Zotero.Item): string {
  const payload = {
    itemType: item.itemType || "",
    fields: journalIdentityFields.map((field) => [
      field,
      getField(item, field).replace(/\s+/g, " ").trim(),
    ]),
  };
  let hash = 2166136261;
  const text = JSON.stringify(payload);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cas-v1:${(hash >>> 0).toString(36)}`;
}

export function resolveJournalIdentityCandidates(
  item: Zotero.Item,
): JournalIdentityCandidate[] {
  const candidates: JournalIdentityCandidate[] = [];
  const publicationTitle = getField(item, "publicationTitle");
  const journalAbbreviation = getField(item, "journalAbbreviation");
  const issn = getField(item, "ISSN");
  const extra = getField(item, "extra");

  for (const value of extractISSNs(`${issn}\n${extra}`)) {
    candidates.push({ field: "ISSN", value, kind: "issn" });
  }

  if (publicationTitle) {
    candidates.push({
      field: "publicationTitle",
      value: publicationTitle,
      kind: "title",
    });
  }

  if (journalAbbreviation) {
    candidates.push({
      field: "journalAbbreviation",
      value: journalAbbreviation,
      kind: "abbreviation",
    });
  }

  return candidates;
}
