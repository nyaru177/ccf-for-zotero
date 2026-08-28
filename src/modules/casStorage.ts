import { config } from "../../package.json";
import { getCASMatcherVersion } from "./casMatcher";
import { CASItemState, CASMatchResult } from "./casTypes";
import { getJournalInputFingerprint } from "./journalIdentity";
import { readJSONPreference, writeJSONPreference } from "./preferenceStore";

const CAS_STORE_KEY = `${config.prefsPrefix}.casState`;
const CAS_STORE_VERSION = 1;

interface CASStateStore {
  version: number;
  items: Record<string, CASItemState>;
}

let casStoreCache: CASStateStore | undefined;
const invalidatedItemIDs = new Set<string>();

function emptyCASStore(): CASStateStore {
  return { version: CAS_STORE_VERSION, items: {} };
}

function readCASStoreFromPrefs(): CASStateStore {
  const parsed = readJSONPreference<Partial<CASStateStore>>(CAS_STORE_KEY, {});
  return {
    version: parsed.version || CAS_STORE_VERSION,
    items: parsed.items || {},
  };
}

function loadCASStore(): CASStateStore {
  if (!casStoreCache) {
    casStoreCache = readCASStoreFromPrefs();
  }
  return casStoreCache;
}

function saveCASStore(store: CASStateStore) {
  writeJSONPreference(CAS_STORE_KEY, store);
  casStoreCache = store;
}

export function getCASItemKey(item: Zotero.Item): string {
  return `${item.libraryID}:${item.id}`;
}

export function clearCASStorageMemoryCache() {
  casStoreCache = undefined;
  invalidatedItemIDs.clear();
}

export interface GetStoredCASStateOptions {
  validateInputFingerprint?: boolean;
}

export function invalidateCASItemStates(ids: Array<string | number>) {
  for (const id of ids) {
    invalidatedItemIDs.add(String(id));
  }
}

export function getStoredCASState(
  item: Zotero.Item,
  catalogVersion: string,
  options: GetStoredCASStateOptions = {},
): CASItemState | undefined {
  const state = loadCASStore().items[getCASItemKey(item)];
  if (!state) return undefined;
  if (state.source === "manual") return state;
  if (invalidatedItemIDs.has(String(item.id))) return undefined;

  const validateInputFingerprint = options.validateInputFingerprint !== false;
  if (
    state.catalogVersion === catalogVersion &&
    state.matcherVersion === getCASMatcherVersion() &&
    (!validateInputFingerprint ||
      !state.inputFingerprint ||
      state.inputFingerprint === getJournalInputFingerprint(item))
  ) {
    return state;
  }
  return undefined;
}

export function saveCASMatchResults(
  entries: Array<{ item: Zotero.Item; result: CASMatchResult }>,
  catalogVersion: string,
) {
  if (entries.length === 0) return;

  const store = loadCASStore();
  const updatedAt = new Date().toISOString();
  const matcherVersion = getCASMatcherVersion();

  for (const { item, result } of entries) {
    const itemKey = getCASItemKey(item);
    invalidatedItemIDs.delete(String(item.id));
    store.items[itemKey] = {
      ...result,
      itemKey,
      catalogVersion,
      matcherVersion,
      inputFingerprint: getJournalInputFingerprint(item),
      updatedAt,
    };
  }

  saveCASStore(store);
}

export function saveCASMatchResult(
  item: Zotero.Item,
  result: CASMatchResult,
  catalogVersion: string,
) {
  saveCASMatchResults([{ item, result }], catalogVersion);
}

export function saveManualCASMatches(
  items: Zotero.Item[],
  result: CASMatchResult,
  catalogVersion: string,
) {
  saveCASMatchResults(
    items.map((item) => ({
      item,
      result: { ...result, source: "manual" },
    })),
    catalogVersion,
  );
}

export function ignoreCASItems(items: Zotero.Item[]) {
  const store = loadCASStore();
  const updatedAt = new Date().toISOString();
  for (const item of items) {
    const itemKey = getCASItemKey(item);
    store.items[itemKey] = {
      itemKey,
      status: "ignored",
      source: "manual",
      updatedAt,
    };
  }
  saveCASStore(store);
}

export function clearCASItemStates(items: Zotero.Item[]) {
  const store = loadCASStore();
  for (const item of items) {
    delete store.items[getCASItemKey(item)];
  }
  saveCASStore(store);
}
