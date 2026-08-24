import { getCatalogVersion, getMatcherVersion, matchCandidates } from "./matcher";
import { resolveVenueCandidates } from "./venueResolver";
import {
  getItemKey,
  getStoredState,
  saveMatchResult,
  saveMatchResults,
} from "./storage";
import { ItemRankState, MatchResult } from "./types";

export interface RefreshItemsRankOptions {
  onProgress?: (
    done: number,
    total: number,
    item: Zotero.Item,
    result: MatchResult,
  ) => void | Promise<void>;
  shouldCancel?: () => boolean;
  saveBatchSize?: number;
}

export interface RefreshItemsRankResult {
  entries: Array<{ item: Zotero.Item; result: MatchResult }>;
  processed: number;
  total: number;
  cancelled: boolean;
}

export interface FilterItemsByDisplayStatusOptions {
  onProgress?: (
    done: number,
    total: number,
    item: Zotero.Item,
    state: ItemRankState,
  ) => void | Promise<void>;
  shouldCancel?: () => boolean;
}

export interface FilterItemsByDisplayStatusResult {
  items: Zotero.Item[];
  processed: number;
  total: number;
  cancelled: boolean;
}

export function resolveItemRank(item: Zotero.Item): MatchResult {
  const resolution = resolveVenueCandidates(item);
  return matchCandidates(resolution.candidates, resolution.isPreprint);
}

export function getDisplayState(item: Zotero.Item): ItemRankState {
  const stored = getStoredState(item);
  if (stored) {
    return stored;
  }

  const result = resolveItemRank(item);
  return toItemRankState(item, result);
}

function toItemRankState(item: Zotero.Item, result: MatchResult): ItemRankState {
  return {
    itemKey: getItemKey(item),
    status: result.status,
    source: result.source,
    rank: result.rank,
    abbr: result.abbr,
    fullName: result.fullName,
    category: result.category,
    venueText: result.venueText,
    confidence: result.confidence,
    catalogVersion: getCatalogVersion(),
    matcherVersion: getMatcherVersion(),
    updatedAt: new Date().toISOString(),
  };
}

export function refreshItemRank(item: Zotero.Item) {
  const result = resolveItemRank(item);
  saveMatchResult(item, result);
  return result;
}

export async function filterItemsByDisplayStatus(
  items: Zotero.Item[],
  statuses: Array<ItemRankState["status"]>,
  options: FilterItemsByDisplayStatusOptions = {},
): Promise<FilterItemsByDisplayStatusResult> {
  const statusSet = new Set(statuses);
  const matchedItems: Zotero.Item[] = [];
  const total = items.length;
  let processed = 0;

  for (let index = 0; index < items.length; index++) {
    if (options.shouldCancel?.()) break;

    const item = items[index];
    const state = getDisplayState(item);
    processed = index + 1;
    if (statusSet.has(state.status)) {
      matchedItems.push(item);
    }

    await options.onProgress?.(processed, total, item, state);
  }

  return {
    items: matchedItems,
    processed,
    total,
    cancelled: processed < total || Boolean(options.shouldCancel?.()),
  };
}

export async function refreshItemsRank(
  items: Zotero.Item[],
  options: RefreshItemsRankOptions = {},
): Promise<RefreshItemsRankResult> {
  const entries: Array<{ item: Zotero.Item; result: MatchResult }> = [];
  let pendingSave: Array<{ item: Zotero.Item; result: MatchResult }> = [];
  const total = items.length;
  const saveBatchSize = Math.max(options.saveBatchSize || total || 1, 1);

  for (let index = 0; index < items.length; index++) {
    if (options.shouldCancel?.()) break;

    const item = items[index];
    const result = resolveItemRank(item);
    const entry = { item, result };
    entries.push(entry);
    pendingSave.push(entry);

    if (pendingSave.length >= saveBatchSize) {
      saveMatchResults(pendingSave);
      pendingSave = [];
    }

    await options.onProgress?.(entries.length, total, item, result);
  }

  saveMatchResults(pendingSave);

  return {
    entries,
    processed: entries.length,
    total,
    cancelled: entries.length < total || Boolean(options.shouldCancel?.()),
  };
}
