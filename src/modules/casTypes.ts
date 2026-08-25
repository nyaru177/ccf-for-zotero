export type CASZone = 1 | 2 | 3 | 4;

export interface CASPlacement {
  category: string;
  zone: CASZone;
}

export interface CASJournal {
  key: string;
  title: string;
  titleZh?: string;
  abbreviation?: string;
  aliases?: string[];
  issn?: string[];
  eissn?: string[];
  majorPlacements: CASPlacement[];
  minorPlacements: CASPlacement[];
  isTop?: boolean;
  isWarned?: boolean;
  evidence?: string;
}

export interface CASCatalog {
  version: string;
  edition?: string;
  year: number;
  updateDate: string;
  source: string;
  sourceHash?: string;
  redistribution?: "allowed" | "private-only" | "unknown";
  journals: CASJournal[];
}

export type CASMatchStatus =
  | "matched"
  | "not-listed"
  | "unknown"
  | "not-applicable"
  | "ignored";

export interface CASMatchResult {
  status: CASMatchStatus;
  source: "auto" | "manual";
  journalKey?: string;
  journalTitle?: string;
  abbreviation?: string;
  issn?: string[];
  majorPlacements?: CASPlacement[];
  minorPlacements?: CASPlacement[];
  isTop?: boolean;
  isWarned?: boolean;
  venueText?: string;
  matchedField?: string;
  matchedValue?: string;
  matchMethod?: string;
  confidence?: number;
  catalogVersion?: string;
}

export interface CASItemState extends CASMatchResult {
  itemKey: string;
  inputFingerprint?: string;
  matcherVersion?: string;
  updatedAt: string;
}

export interface JournalIdentityCandidate {
  field: string;
  value: string;
  kind: "issn" | "title" | "abbreviation";
}

