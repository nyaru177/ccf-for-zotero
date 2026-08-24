import { config } from "../../package.json";
import { getCatalogVersion, getMatcherVersion } from "./matcher";
import { ItemRankState, MatchResult } from "./types";
import { getItemInputFingerprint } from "./venueResolver";

const STORE_KEY = `${config.prefsPrefix}.itemState`;
const STORE_VERSION = 1;

interface StateStore {
  version: number;
  items: Record<string, ItemRankState>;
}

let storeCache: StateStore | undefined;

function emptyStore(): StateStore {
  return { version: STORE_VERSION, items: {} };
}

function readStoreFromPrefs(): StateStore {
  const raw = Zotero.Prefs.get(STORE_KEY, true) as string;
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as StateStore;
    return {
      version: parsed.version || STORE_VERSION,
      items: parsed.items || {},
    };
  } catch (error) {
    ztoolkit?.log?.("Could not parse rank state store", error);
    return emptyStore();
  }
}

function loadStore(): StateStore {
  if (!storeCache) {
    storeCache = readStoreFromPrefs();
  }
  return storeCache;
}

function saveStore(store: StateStore) {
  storeCache = store;
  Zotero.Prefs.set(STORE_KEY, JSON.stringify(store), true);
}

export function getItemKey(item: Zotero.Item): string {
  return `${item.libraryID}:${item.id}`;
}

export function clearStorageMemoryCache() {
  storeCache = undefined;
}

export function getStoredState(item: Zotero.Item): ItemRankState | undefined {
  const state = loadStore().items[getItemKey(item)];
  if (!state) return undefined;
  if (state.source === "manual") return state;
  if (
    state.catalogVersion === getCatalogVersion() &&
    state.matcherVersion === getMatcherVersion() &&
    (!state.inputFingerprint ||
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
