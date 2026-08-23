export type CCFKind = "conference" | "journal";
export type CCFRank = "A" | "B" | "C";

export interface CCFVenue {
  kind: CCFKind;
  abbr: string;
  fullName: string;
  rank: CCFRank;
  category: string;
  aliases?: string[];
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
  catalogVersion?: string;
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
}
