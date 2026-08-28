import { config } from "../../package.json";
import { getCatalogVersion, getMatcherVersion } from "./matcher";
import { ItemRankState, MatchResult } from "./types";
import { getItemInputFingerprint } from "./venueResolver";
import { readJSONPreference, writeJSONPreference } from "./preferenceStore";

const STORE_KEY = `${config.prefsPrefix}.itemState`;
const STORE_VERSION = 1;

interface StateStore {
  version: number;
  items: Record<string, ItemRankState>;
}

let storeCache: StateStore | undefined;
const invalidatedItemIDs = new Set<string>();

function emptyStore(): StateStore {
  return { version: STORE_VERSION, items: {} };
}

function readStoreFromPrefs(): StateStore {
  const parsed = readJSONPreference<Partial<StateStore>>(STORE_KEY, {});
  return {
    version: parsed.version || STORE_VERSION,
    items: parsed.items || {},
  };
}

function loadStore(): StateStore {
  if (!storeCache) {
    storeCache = readStoreFromPrefs();
  }
  return storeCache;
}

function saveStore(store: StateStore) {
  writeJSONPreference(STORE_KEY, store);
  storeCache = store;
}

export function getItemKey(item: Zotero.Item): string {
  return `${item.libraryID}:${item.id}`;
}

export function clearStorageMemoryCache() {
  storeCache = undefined;
  invalidatedItemIDs.clear();
}

export interface GetStoredStateOptions {
  validateInputFingerprint?: boolean;
}

export function invalidateItemStates(ids: Array<string | number>) {
  for (const id of ids) {
    invalidatedItemIDs.add(String(id));
  }
}

export function getStoredState(
  item: Zotero.Item,
  options: GetStoredStateOptions = {},
): ItemRankState | undefined {
  const state = loadStore().items[getItemKey(item)];
  if (!state) return undefined;
  if (state.source === "manual") return state;
  if (invalidatedItemIDs.has(String(item.id))) return undefined;

  const validateInputFingerprint = options.validateInputFingerprint !== false;
  if (
    state.catalogVersion === getCatalogVersion() &&
    state.matcherVersion === getMatcherVersion() &&
    (!validateInputFingerprint ||
      !state.inputFingerprint ||
      state.inputFingerprint === getItemInputFingerprint(item))
  ) {
    return state;
  }
  return undefined;
}

export function saveMatchResult(item: Zotero.Item, result: MatchResult) {
  saveMatchResults([{ item, result }]);
}

export function saveMatchResults(
  entries: Array<{ item: Zotero.Item; result: MatchResult }>,
) {
  if (entries.length === 0) return;

  const store = loadStore();
  const updatedAt = new Date().toISOString();
  const catalogVersion = getCatalogVersion();
  const matcherVersion = getMatcherVersion();
  for (const { item, result } of entries) {
    const itemKey = getItemKey(item);
    invalidatedItemIDs.delete(String(item.id));
    store.items[itemKey] = {
      itemKey,
      status: result.status,
      source: result.source,
      rank: result.rank,
      abbr: result.abbr,
      fullName: result.fullName,
      category: result.category,
      venueText: result.venueText,
      confidence: result.confidence,
      inputFingerprint: getItemInputFingerprint(item),
      matchedField: result.matchedField,
      matchedValue: result.matchedValue,
      matchMethod: result.matchMethod,
      catalogVersion,
      matcherVersion,
      updatedAt,
    };
  }
  saveStore(store);
}

export function saveManualMatch(item: Zotero.Item, result: MatchResult) {
  saveManualMatches([item], result);
}

export function saveManualMatches(items: Zotero.Item[], result: MatchResult) {
  saveMatchResults(
    items.map((item) => ({
      item,
      result: { ...result, source: "manual" },
    })),
  );
}

export function ignoreItem(item: Zotero.Item) {
  ignoreItems([item]);
}

export function ignoreItems(items: Zotero.Item[]) {
  const store = loadStore();
  const updatedAt = new Date().toISOString();
  for (const item of items) {
    const itemKey = getItemKey(item);
    store.items[itemKey] = {
      itemKey,
      status: "ignored",
      source: "manual",
      updatedAt,
    };
  }
  saveStore(store);
}

export function clearItemState(item: Zotero.Item) {
  clearItemStates([item]);
}

export function clearItemStates(items: Zotero.Item[]) {
  const store = loadStore();
  for (const item of items) {
    delete store.items[getItemKey(item)];
  }
  saveStore(store);
}
