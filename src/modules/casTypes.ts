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

export type CASSourceKind =
  | "official-platform"
  | "official-announcement"
  | "authorized-institution-export"
  | "authorized-file"
  | "third-party-public-repack"
  | "fixture"
  | "unknown";

export interface CASCatalogProvenance {
  sourceKind: CASSourceKind;
  sourceURL?: string;
  accessDate: string;
  permissionNote: string;
}

export interface CASCatalog {
  version: string;
  edition?: string;
  year: number;
  updateDate: string;
  source: string;
  sourceHash?: string;
  provenance?: CASCatalogProvenance;
  redistribution?: "allowed" | "private-only" | "unknown";
  dataStatus?:
    | "official-snapshot"
    | "third-party-snapshot"
    | "metadata-only"
    | "fixture";
  journals: CASJournal[];
}

export type CASMatchStatus =
  | "matched"
  | "not-listed"
  | "unknown"
  | "not-applicable"
  | "data-missing"
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

