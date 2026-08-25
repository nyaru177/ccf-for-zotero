import {
  getCASCatalogStatusText,
  getCASCatalogVersion,
  getCASIndex,
  hasBundledCASSnapshot,
} from "./casCatalog";
import { getCASMatcherVersion, matchCASItem } from "./casMatcher";
import { CASItemState, CASMatchResult } from "./casTypes";
import {
  getCASItemKey,
  getStoredCASState,
  saveCASMatchResult,
  saveCASMatchResults,
} from "./casStorage";
import { getJournalInputFingerprint } from "./journalIdentity";

export interface GetCASDisplayStateOptions {
  computeIfMissing?: boolean;
}

export interface RefreshCASItemsOptions {
  onProgress?: (
    done: number,
    total: number,
    item: Zotero.Item,
    result: CASMatchResult,
  ) => void | Promise<void>;
  shouldCancel?: () => boolean;
  saveBatchSize?: number;
}

export interface RefreshCASItemsResult {
  entries: Array<{ item: Zotero.Item; result: CASMatchResult }>;
  processed: number;
  total: number;
  cancelled: boolean;
}

export interface FilterCASItemsByDisplayStatusOptions {
  onProgress?: (
    done: number,
    total: number,
    item: Zotero.Item,
    state: CASItemState,
  ) => void | Promise<void>;
  shouldCancel?: () => boolean;
}

export interface FilterCASItemsByDisplayStatusResult {
  items: Zotero.Item[];
  processed: number;
  total: number;
  cancelled: boolean;
}

const journalItemTypes = new Set(["journalArticle"]);

function makeNotApplicableResult(): CASMatchResult {
  return {
    status: "not-applicable",
    source: "auto",
    matchMethod: "条目类型不适用 CAS 期刊分区",
    confidence: 1,
    catalogVersion: getCASCatalogVersion(),
  };
}

function makeDataMissingResult(): CASMatchResult {
  return {
    status: "data-missing",
    source: "auto",
    matchMethod: getCASCatalogStatusText(),
    confidence: 0,
    catalogVersion: getCASCatalogVersion(),
  };
}

function makeUnknownWithoutComputeResult(): CASMatchResult {
  return {
    status: "unknown",
    source: "auto",
    matchMethod: "无有效缓存；未在列排序路径即时计算",
    confidence: 0,
    catalogVersion: getCASCatalogVersion(),
  };
}

export function resolveCASItem(item: Zotero.Item): CASMatchResult {
  if (!journalItemTypes.has(item.itemType || "")) {
    return makeNotApplicableResult();
  }

  if (!hasBundledCASSnapshot()) {
    return makeDataMissingResult();
  }

  return matchCASItem(item, getCASIndex());
}

function toCASItemState(
  item: Zotero.Item,
  result: CASMatchResult,
): CASItemState {
  return {
    ...result,
    itemKey: getCASItemKey(item),
    catalogVersion: getCASCatalogVersion(),
    matcherVersion: getCASMatcherVersion(),
    inputFingerprint: getJournalInputFingerprint(item),
    updatedAt: new Date().toISOString(),
  };
}

export function getCASDisplayState(
  item: Zotero.Item,
  options: GetCASDisplayStateOptions = {},
): CASItemState {
  const stored = getStoredCASState(item, getCASCatalogVersion());
  if (stored) {
    return stored;
  }

  if (!journalItemTypes.has(item.itemType || "")) {
    return toCASItemState(item, makeNotApplicableResult());
  }

  if (!hasBundledCASSnapshot()) {
    return toCASItemState(item, makeDataMissingResult());
  }

  if (options.computeIfMissing === false) {
    return toCASItemState(item, makeUnknownWithoutComputeResult());
  }

  return toCASItemState(item, resolveCASItem(item));
}

export function refreshCASItem(item: Zotero.Item) {
  const result = resolveCASItem(item);
  saveCASMatchResult(item, result, getCASCatalogVersion());
  return result;
}

export async function filterCASItemsByDisplayStatus(
  items: Zotero.Item[],
  statuses: Array<CASItemState["status"]>,
  options: FilterCASItemsByDisplayStatusOptions = {},
): Promise<FilterCASItemsByDisplayStatusResult> {
  const statusSet = new Set(statuses);
  const matchedItems: Zotero.Item[] = [];
  const total = items.length;
  let processed = 0;

  for (let index = 0; index < items.length; index++) {
    if (options.shouldCancel?.()) break;

    const item = items[index];
    const state = getCASDisplayState(item);
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

export async function refreshCASItems(
  items: Zotero.Item[],
  options: RefreshCASItemsOptions = {},
): Promise<RefreshCASItemsResult> {
  const entries: Array<{ item: Zotero.Item; result: CASMatchResult }> = [];
  let pendingSave: Array<{ item: Zotero.Item; result: CASMatchResult }> = [];
  const total = items.length;
  const saveBatchSize = Math.max(options.saveBatchSize || total || 1, 1);

  for (let index = 0; index < items.length; index++) {
    if (options.shouldCancel?.()) break;

    const item = items[index];
    const result = resolveCASItem(item);
    const entry = { item, result };
    entries.push(entry);
    pendingSave.push(entry);

    if (pendingSave.length >= saveBatchSize) {
      saveCASMatchResults(pendingSave, getCASCatalogVersion());
      pendingSave = [];
    }

    await options.onProgress?.(entries.length, total, item, result);
  }

  saveCASMatchResults(pendingSave, getCASCatalogVersion());

  return {
    entries,
    processed: entries.length,
    total,
    cancelled: entries.length < total || Boolean(options.shouldCancel?.()),
  };
}
