import {
  CASCatalog,
  CASJournal,
  CASMatchResult,
  JournalIdentityCandidate,
} from "./casTypes";
import {
  normalizeISSN,
  normalizeJournalTitle,
  resolveJournalIdentityCandidates,
} from "./journalIdentity";

export interface CASIndex {
  catalog: CASCatalog;
  byISSN: Map<string, CASJournal>;
  byTitle: Map<string, CASJournal>;
}

const journalItemTypes = new Set(["journalArticle"]);

function indexTitle(map: Map<string, CASJournal>, value: string | undefined, journal: CASJournal) {
  if (!value) return;
  const normalized = normalizeJournalTitle(value);
  if (normalized) map.set(normalized, journal);
}

export function buildCASIndex(catalog: CASCatalog): CASIndex {
  const byISSN = new Map<string, CASJournal>();
  const byTitle = new Map<string, CASJournal>();

  for (const journal of catalog.journals) {
    for (const value of [...(journal.issn || []), ...(journal.eissn || [])]) {
      const normalized = normalizeISSN(value);
      if (normalized) byISSN.set(normalized, journal);
    }

    indexTitle(byTitle, journal.title, journal);
    indexTitle(byTitle, journal.titleZh, journal);
    indexTitle(byTitle, journal.abbreviation, journal);
    for (const alias of journal.aliases || []) {
      indexTitle(byTitle, alias, journal);
    }
  }

  return { catalog, byISSN, byTitle };
}

function toMatchedResult(
  index: CASIndex,
  journal: CASJournal,
  candidate: JournalIdentityCandidate,
  matchMethod: string,
  confidence: number,
): CASMatchResult {
  return {
    status: "matched",
    source: "auto",
    journalKey: journal.key,
    journalTitle: journal.title,
    abbreviation: journal.abbreviation,
    issn: [...(journal.issn || []), ...(journal.eissn || [])]
      .map((value) => normalizeISSN(value))
      .filter((value): value is string => Boolean(value)),
    majorPlacements: journal.majorPlacements,
    minorPlacements: journal.minorPlacements,
    isTop: journal.isTop,
    isWarned: journal.isWarned,
    venueText: candidate.value,
    matchedField: candidate.field,
    matchedValue: candidate.value,
    matchMethod,
    confidence,
    catalogVersion: index.catalog.version,
  };
}

function firstVenueCandidate(
  candidates: JournalIdentityCandidate[],
): JournalIdentityCandidate | undefined {
  return candidates.find((candidate) => candidate.kind !== "issn");
}

export function matchCASCandidates(
  candidates: JournalIdentityCandidate[],
  index: CASIndex,
): CASMatchResult {
  for (const candidate of candidates) {
    if (candidate.kind !== "issn") continue;
    const journal = index.byISSN.get(candidate.value);
    if (journal) {
      return toMatchedResult(index, journal, candidate, "ISSN 精确匹配", 1);
    }
  }

  for (const candidate of candidates) {
    if (candidate.kind === "issn") continue;
    const journal = index.byTitle.get(normalizeJournalTitle(candidate.value));
    if (journal) {
      return toMatchedResult(
        index,
        journal,
        candidate,
        `${candidate.field} 精确题名/简称匹配`,
        candidate.kind === "abbreviation" ? 0.94 : 0.96,
      );
    }
  }

  const venue = firstVenueCandidate(candidates);
  if (venue) {
    return {
      status: "not-listed",
      source: "auto",
      venueText: venue.value,
      matchedField: venue.field,
      matchedValue: venue.value,
      matchMethod: "已识别期刊身份，但未命中当前 CAS 快照",
      confidence: 0.5,
      catalogVersion: index.catalog.version,
    };
  }

  return {
    status: "unknown",
    source: "auto",
    matchMethod: "没有足够期刊身份线索",
    confidence: 0,
    catalogVersion: index.catalog.version,
  };
}

export function matchCASItem(
  item: Zotero.Item,
  index: CASIndex,
): CASMatchResult {
  if (!journalItemTypes.has(item.itemType || "")) {
    return {
      status: "not-applicable",
      source: "auto",
      matchMethod: "条目类型不适用 CAS 期刊分区",
      confidence: 1,
      catalogVersion: index.catalog.version,
    };
  }

  return matchCASCandidates(resolveJournalIdentityCandidates(item), index);
}
