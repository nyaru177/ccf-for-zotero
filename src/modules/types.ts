export type CCFKind = "conference" | "journal";
export type CCFRank = "A" | "B" | "C" | "T1" | "T2" | "T3";

export interface CCFVenue {
  kind: CCFKind;
  abbr: string;
  fullName: string;
  rank: CCFRank;
  category: string;
  aliases?: string[];
  language?: string;
  cn?: string;
  sponsor?: string;
  sourceIndex?: number;
}

export interface CCFDataFile {
  version: string;
  updateDate: string;
  source: string;
  venues: CCFVenue[];
}

export type RankStatus =
  | "matched"
  | "none"
  | "unknown"
  | "preprint"
  | "ignored";

export interface ItemRankState {
  itemKey: string;
  status: RankStatus;
  source: "auto" | "manual";
  rank?: CCFRank;
  abbr?: string;
  fullName?: string;
  category?: string;
  venueText?: string;
  confidence?: number;
  inputFingerprint?: string;
  matchedField?: string;
  matchedValue?: string;
  matchMethod?: string;
  catalogVersion?: string;
  matcherVersion?: string;
  updatedAt: string;
}

export interface VenueCandidate {
  value: string;
  field: string;
  kindHint?: CCFKind;
  context?: string;
}

export interface VenueResolution {
  candidates: VenueCandidate[];
  isPreprint: boolean;
}

export interface MatchResult {
  status: "matched" | "none" | "unknown" | "preprint";
  source: "auto" | "manual";
  venueText?: string;
  rank?: CCFRank;
  abbr?: string;
  fullName?: string;
  category?: string;
  confidence?: number;
  matchedField?: string;
  matchedValue?: string;
  matchMethod?: string;
}
