import ccfData from "../data/ccf-2026.json";
import highQualityJournalData from "../data/ccf-high-quality-journals-2025.json";
import {
  CCFDataFile,
  CCFKind,
  CCFVenue,
  MatchResult,
  VenueCandidate,
} from "./types";

interface IndexedVenue {
  venue: CCFVenue;
  normalizedFullName: string;
  aliases: string[];
  meaningfulTokens: Set<string>;
}

const internationalData = ccfData as CCFDataFile;
const chineseJournalData = highQualityJournalData as CCFDataFile;
const data: CCFDataFile = {
  version: `${internationalData.version}+${chineseJournalData.version}`,
  updateDate: chineseJournalData.updateDate,
  source: `${internationalData.source}; ${chineseJournalData.source}`,
  venues: [...internationalData.venues, ...chineseJournalData.venues],
};
const MATCHER_VERSION = "0.1.15-chinese-t-rank";

const genericTokens = new Set([
  "acm",
  "and",
  "annual",
  "association",
  "computer",
  "conference",
  "ieee",
  "international",
  "journal",
  "meeting",
  "on",
  "of",
  "proceedings",
  "symposium",
  "the",
  "transactions",
  "workshop",
]);

const tokenExpansions: Record<string, string> = {
  adv: "advanced",
  anal: "analysis",
  artif: "artificial",
  autom: "automation",
  bioinform: "bioinformatics",
  biomed: "biomedicine",
  comput: "computational",
  conf: "conference",
  cybern: "cybernetics",
  digit: "digital",
  electr: "electrical",
  eng: "engineering",
  int: "international",
  intell: "intelligence",
  lang: "language",
  linguist: "linguistics",
  mach: "machine",
  proc: "processing",
  robot: "robotics",
  secur: "security",
  softw: "software",
  syst: "systems",
  technol: "technology",
  trans: "transactions",
};

function expandVenueTokens(value: string): string {
  return value
    .split(" ")
    .map((token) => tokenExpansions[token] || token)
    .join(" ");
}

function normalizeText(value: string): string {
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b([a-z]+)\s*['’]\d{2,4}\b/g, "$1")
    .replace(/[“”"'’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+/\-\s\u4e00-\u9fff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return expandVenueTokens(normalized);
}

function normalizeAbbr(value: string): string {
  return value
    .toUpperCase()
    .replace(/[“”"'’`]/g, "")
    .replace(/[^A-Z0-9+/\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBoilerplate(value: string): string {
  return value
    .replace(/^proceedings of (the )?/i, "")
    .replace(/^proc\.? of (the )?/i, "")
    .replace(/^in:\s*/i, "")
    .replace(/^\d{4}\s+/, "")
    .replace(/\s*\(.*?\)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStrictNonMainMarkers(value: string): Set<string> {
  const normalized = normalizeText(value);
  const markers = new Set<string>();
  if (/\bfindings\b/.test(normalized)) markers.add("findings");
  if (/\bworkshops?\b/.test(normalized)) markers.add("workshop");
  if (/\bcompanion\b/.test(normalized)) markers.add("companion");
  if (/\bextended abstracts?\b/.test(normalized)) markers.add("extended");
  if (/\badjunct\b/.test(normalized)) markers.add("extended");
  return markers;
}

function extractExplicitAbbrs(value: string): string[] {
  const candidates = new Set<string>();

  for (const match of value.matchAll(/\(([A-Za-z][A-Za-z0-9+/-]{1,})\)/g)) {
    candidates.add(normalizeAbbr(match[1]));
  }

  const trailing = value.match(/,\s*([A-Za-z][A-Za-z0-9+/-]{1,})\s*$/);
  if (trailing?.[1]) {
    candidates.add(normalizeAbbr(trailing[1]));
  }

  return [...candidates].filter(Boolean);
}

function indexedVenueMentionsStrictMarker(
  indexed: IndexedVenue,
  marker: string,
): boolean {
  const values = [indexed.venue.fullName, ...(indexed.venue.aliases || [])];
  return values.some((value) => getStrictNonMainMarkers(value).has(marker));
}

function indexedVenueAllowsStrictMarkers(
  candidate: string,
  indexed: IndexedVenue,
): boolean {
  const markers = getStrictNonMainMarkers(candidate);
  if (markers.size === 0) return true;

  for (const marker of markers) {
    if (!indexedVenueMentionsStrictMarker(indexed, marker)) {
      return false;
    }
  }
  return true;
}

function candidateExplicitlyRejectsVenue(
  candidate: string,
  indexed: IndexedVenue,
): boolean {
  const normalized = normalizeText(candidate);
  const abbr = normalizeAbbr(candidate).replace(/\s+/g, "");
  const venueAbbr = indexed.venue.abbr;

  if (
    venueAbbr === "ICMI" &&
    /\bcomputing and machine intelligence\b/.test(normalized)
  ) {
    return true;
  }

  if (venueAbbr === "ICRA" && /\bicrai\b/i.test(candidate)) {
    return true;
  }

  if (
    venueAbbr === "TSE" &&
    (/\bvfast\b/.test(normalized) ||
      /\bsoftware engineering and methodology\b/.test(normalized))
  ) {
    return true;
  }

  if (
    venueAbbr === "JBI" &&
    /\bcomputing and biomedical informatics\b/.test(normalized)
  ) {
    return true;
  }

  if (venueAbbr === "TOPS" && /\bieee security and privacy\b/.test(normalized)) {
    return true;
  }

  return Boolean(venueAbbr === "ICRA" && abbr === "ICRAI");
}

function candidateCanMatchIndexed(
  candidate: string,
  indexed: IndexedVenue,
): boolean {
  return (
    indexedVenueAllowsStrictMarkers(candidate, indexed) &&
    !candidateExplicitlyRejectsVenue(candidate, indexed)
  );
}

function explicitAbbrSupportsVenue(
  explicitAbbrs: string[],
  indexed: IndexedVenue,
): boolean {
  if (explicitAbbrs.length === 0) return true;
  const aliases = new Set(
    indexed.aliases.map((alias) => alias.replace(/\s+/g, "")),
  );
  return explicitAbbrs.some((abbr) => aliases.has(abbr.replace(/\s+/g, "")));
}

function tokenizeMeaningful(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !genericTokens.has(token)),
  );
}

function containsCjk(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function generateAliases(venue: CCFVenue): string[] {
  const aliases = new Set<string>();
  const rawAliases = [venue.abbr, venue.fullName, ...(venue.aliases || [])];

  for (const alias of rawAliases) {
    const normalizedText = normalizeText(alias);
    if (normalizedText) {
      aliases.add(normalizedText);
      if (!containsCjk(normalizedText)) {
        aliases.add(normalizedText.replace(/\s+/g, ""));
      }
    }

    const normalized = normalizeAbbr(alias);
    if (!normalized) continue;
    aliases.add(normalized);
    aliases.add(normalized.replace(/\s+/g, ""));

    const prefixPattern = /^(INTERNATIONAL|IEEE|ACM|THE)\s+/;
    let stripped = normalized;
    while (prefixPattern.test(stripped)) {
      stripped = stripped.replace(prefixPattern, "").trim();
      if (stripped.length >= 2) {
        aliases.add(stripped);
        aliases.add(stripped.replace(/\s+/g, ""));
      }
    }
  }

  // Common community shorthand that differs from the official CCF abbreviation.
  if (venue.abbr === "SIGKDD") {
    aliases.add("KDD");
  }

  return [...aliases].filter(Boolean);
}

function buildIndex() {
  const venues = data.venues;
  const indexed = venues.map((venue) => ({
    venue,
    normalizedFullName: normalizeText(venue.fullName),
    aliases: generateAliases(venue),
    meaningfulTokens: tokenizeMeaningful(venue.fullName),
  }));

  const aliasMap = new Map<string, IndexedVenue[]>();
  const fullNameMap = new Map<string, IndexedVenue[]>();

  for (const entry of indexed) {
    const fullEntries = fullNameMap.get(entry.normalizedFullName) || [];
    fullEntries.push(entry);
    fullNameMap.set(entry.normalizedFullName, fullEntries);

    for (const alias of entry.aliases) {
      const entries = aliasMap.get(alias) || [];
      entries.push(entry);
      aliasMap.set(alias, entries);
    }
  }

  return { indexed, aliasMap, fullNameMap };
}

const index = buildIndex();
const ambiguousBareAbbrs = new Set(["AI"]);

function deriveCanonicalVenueQueries(value: string): string[] {
  const queries = new Set<string>();
  const normalized = normalizeText(value);
  const abbr = normalizeAbbr(value);

  if (getStrictNonMainMarkers(value).size > 0) {
    return [];
  }

  if (
    /\b(ACM\s+)?WEB\s+CONFERENCE\b/.test(abbr) ||
    /\bTHE\s+WEB\s+CONFERENCE\b/.test(abbr) ||
    /\bWWW\s+20\d{2}\b/.test(abbr)
  ) {
    queries.add("WWW");
    queries.add("International World Wide Web Conference");
  }

  if (/\bINFOCOM\b/.test(abbr) && /\b(IEEE|PROC|PROCEEDINGS)\b/.test(abbr)) {
    queries.add("INFOCOM");
  }

  const mentionsNaacl =
    /\bnorth american chapter\b/.test(normalized) ||
    /\bnations of the americas chapter\b/.test(normalized);
  const mentionsAclOrg =
    /\bassociation\b/.test(normalized) ||
    /\bcomputational linguistics\b/.test(normalized);
  if (mentionsNaacl && mentionsAclOrg) {
    queries.add("NAACL");
  }

  return [...queries].filter((query) => query !== value);
}

function containsAlias(normalizedCandidate: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  if (containsCjk(normalizedAlias)) {
    return normalizedCandidate === normalizedAlias;
  }
  const escaped = normalizedAlias
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(normalizedCandidate);
}

function scoreVenue(
  candidate: string,
  normalizedCandidate: string,
  indexed: IndexedVenue,
  kindHint?: CCFKind,
): number {
  let score = 0;
  const kindMismatch = Boolean(kindHint && indexed.venue.kind !== kindHint);
  const safeFullNameContainment = indexed.meaningfulTokens.size >= 3;
  const fullNameWordCount = indexed.normalizedFullName
    .split(" ")
    .filter(Boolean).length;
  const requiredTokenOverlap =
    indexed.meaningfulTokens.size === 2 && fullNameWordCount >= 4
      ? indexed.meaningfulTokens.size
      : 3;
  const explicitAbbrs = extractExplicitAbbrs(candidate);
  const explicitAbbrConflict = !explicitAbbrSupportsVenue(
    explicitAbbrs,
    indexed,
  );
  const broadMatchAllowed =
    !kindMismatch &&
    !explicitAbbrConflict &&
    indexedVenueAllowsStrictMarkers(candidate, indexed) &&
    !candidateExplicitlyRejectsVenue(candidate, indexed);

  if (candidateExplicitlyRejectsVenue(candidate, indexed)) {
    return 0;
  }

  if (kindHint && indexed.venue.kind === kindHint) {
    score += 120;
  }

  if (!kindMismatch && normalizedCandidate === indexed.normalizedFullName) {
    score += 1000;
  } else if (
    broadMatchAllowed &&
    safeFullNameContainment &&
    normalizedCandidate.includes(indexed.normalizedFullName)
  ) {
    score += 820;
  }

  const candidateAbbr = normalizeAbbr(candidate);
  const seenAliases = new Set<string>();
  for (const alias of indexed.aliases) {
    const aliasKey = `${normalizeText(alias)}|${normalizeAbbr(alias)}`;
    if (seenAliases.has(aliasKey)) continue;
    seenAliases.add(aliasKey);

    if (!kindMismatch && candidateAbbr === alias) {
      score += 950;
    } else if (
      broadMatchAllowed &&
      alias.length >= 4 &&
      containsAlias(normalizedCandidate, alias)
    ) {
      score += 650;
    }
  }

  const tokens = tokenizeMeaningful(candidate);
  let overlap = 0;
  for (const token of tokens) {
    if (indexed.meaningfulTokens.has(token)) {
      overlap += 1;
    }
  }
  if (broadMatchAllowed && overlap >= requiredTokenOverlap) {
    const precision = overlap / Math.max(tokens.size, 1);
    const recall = overlap / Math.max(indexed.meaningfulTokens.size, 1);
    const f1 = (2 * precision * recall) / Math.max(precision + recall, 0.01);
    const base =
      indexed.meaningfulTokens.size === 2 && fullNameWordCount >= 4
        ? 550
        : 500;
    score += Math.round(base + f1 * 200);
  }

  return score;
}

function pickBest(
  entries: IndexedVenue[],
  candidate: string,
  kindHint?: CCFKind,
): IndexedVenue | undefined {
  const compatibleEntries = kindHint
    ? entries.filter((entry) => entry.venue.kind === kindHint)
    : entries;
  const allowedEntries = compatibleEntries.filter((entry) =>
    candidateCanMatchIndexed(candidate, entry),
  );
  if (allowedEntries.length === 0) return undefined;
  if (allowedEntries.length === 1) return allowedEntries[0];

  const normalizedCandidate = normalizeText(candidate);
  return allowedEntries
    .map((entry) => ({
      entry,
      score: scoreVenue(candidate, normalizedCandidate, entry, kindHint),
    }))
    .sort((a, b) => b.score - a.score)[0]?.entry;
}

export function findVenue(
  value: string,
  kindHint?: CCFKind,
): MatchResult | undefined {
  const stripped = stripBoilerplate(value);
  if (!stripped) return undefined;

  const queries = [stripped, ...deriveCanonicalVenueQueries(stripped)];
  for (const query of queries) {
    const match = findVenueFromQuery(query, kindHint, stripped);
    if (match) return match;
  }

  return undefined;
}

function findVenueFromQuery(
  query: string,
  kindHint: CCFKind | undefined,
  venueText: string,
): MatchResult | undefined {
  const stripped = stripBoilerplate(query);
  if (!stripped) return undefined;

  const normalized = normalizeText(stripped);
  const abbr = normalizeAbbr(stripped);

  const exactAlias = abbr
    ? pickBest(index.aliasMap.get(abbr) || [], stripped, kindHint)
    : undefined;
  if (exactAlias) {
    return toMatchResult(exactAlias, venueText, 1);
  }

  const compactAlias = abbr
    ? pickBest(
        index.aliasMap.get(abbr.replace(/\s+/g, "")) || [],
        stripped,
        kindHint,
      )
    : undefined;
  if (compactAlias) {
    return toMatchResult(compactAlias, venueText, 0.98);
  }

  const exactTextAlias = pickBest(
    index.aliasMap.get(normalized) || [],
    stripped,
    kindHint,
  );
  if (exactTextAlias) {
    return toMatchResult(exactTextAlias, venueText, 0.98);
  }

  const exactFull = pickBest(
    index.fullNameMap.get(normalized) || [],
    stripped,
    kindHint,
  );
  if (exactFull) {
    return toMatchResult(exactFull, venueText, 0.96);
  }

  const leadingToken = stripped.match(/^([A-Za-z][A-Za-z0-9+/-]{1,})\b/);
  if (leadingToken) {
    const token = normalizeAbbr(leadingToken[1]);
    const leadingAlias = pickBest(
      index.aliasMap.get(token) || [],
      stripped,
      kindHint,
    );
    if (leadingAlias) {
      return toMatchResult(leadingAlias, venueText, 0.92);
    }
  }

  let best: { entry: IndexedVenue; score: number } | undefined;
  for (const entry of index.indexed) {
    const score = scoreVenue(stripped, normalized, entry, kindHint);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (best && best.score >= 780) {
    return toMatchResult(best.entry, venueText, Math.min(best.score / 1000, 0.9));
  }

  return undefined;
}

export function matchCandidates(
  candidates: VenueCandidate[],
  isPreprint: boolean,
): MatchResult {
  for (const candidate of candidates) {
    const match = findVenue(candidate.value, candidate.kindHint);
    if (match) {
      if (!candidateSupportsAmbiguousBareAbbr(candidate, match)) {
        continue;
      }
      if (
        candidate.context &&
        isAbbreviationCandidate(candidate.value) &&
        !contextSupportsMatch(match, candidate.context)
      ) {
        continue;
      }
      return match;
    }
  }

  if (isPreprint) {
    return {
      status: "preprint",
      source: "auto",
      venueText: "arXiv",
      confidence: 1,
    };
  }

  const firstVenue = candidates.find((candidate) => candidate.value.trim());
  if (firstVenue) {
    return {
      status: "none",
      source: "auto",
      venueText: firstVenue.value,
      confidence: 0.5,
    };
  }

  return {
    status: "unknown",
    source: "auto",
    confidence: 0,
  };
}

export function getVenueCount() {
  return data.venues.length;
}

export function getCatalogVersion() {
  return data.version;
}

export function getMatcherVersion() {
  return MATCHER_VERSION;
}

export function getVenues(): CCFVenue[] {
  return data.venues;
}

function toMatchResult(
  indexed: IndexedVenue,
  venueText: string,
  confidence: number,
): MatchResult {
  return {
    status: "matched",
    source: "auto",
    rank: indexed.venue.rank,
    abbr: indexed.venue.abbr,
    fullName: indexed.venue.fullName,
    category: indexed.venue.category,
    venueText,
    confidence,
  };
}

function isAbbreviationCandidate(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z0-9+/-]{1,15}$/.test(trimmed);
}

function contextSupportsMatch(match: MatchResult, context: string): boolean {
  if (match.status !== "matched" || !match.fullName) return true;

  const normalizedContext = normalizeText(context);
  const normalizedFullName = normalizeText(match.fullName);
  if (
    normalizedFullName &&
    match.fullName.split(/\s+/).length >= 3 &&
    normalizedContext.includes(normalizedFullName)
  ) {
    return true;
  }

  const contextTokens = tokenizeMeaningful(context);
  const fullTokens = tokenizeMeaningful(match.fullName);
  if (fullTokens.size === 0) return true;

  let overlap = 0;
  for (const token of fullTokens) {
    if (contextTokens.has(token)) overlap += 1;
  }

  const required = fullTokens.size <= 2 ? fullTokens.size : 2;
  return overlap >= required;
}

function candidateSupportsAmbiguousBareAbbr(
  candidate: VenueCandidate,
  match: MatchResult,
): boolean {
  if (match.status !== "matched" || !match.abbr || !match.fullName) return true;

  const candidateAbbr = normalizeAbbr(stripBoilerplate(candidate.value)).replace(
    /\s+/g,
    "",
  );
  if (!ambiguousBareAbbrs.has(match.abbr) || candidateAbbr !== match.abbr) {
    return true;
  }

  const normalizedCandidate = normalizeText(candidate.value);
  const normalizedFullName = normalizeText(match.fullName);
  if (normalizedCandidate === normalizedFullName) return true;

  const field = candidate.field.toLowerCase();
  const isJournalField =
    field === "publicationtitle" || field === "journalabbreviation";
  if (candidate.kindHint === "journal" && isJournalField) return true;

  const context = normalizeText(`${candidate.value} ${candidate.context || ""}`);
  return Boolean(normalizedFullName && context.includes(normalizedFullName));
}
