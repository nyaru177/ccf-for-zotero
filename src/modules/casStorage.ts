import { config } from "../../package.json";
import { getCASMatcherVersion } from "./casMatcher";
import { CASItemState, CASMatchResult } from "./casTypes";
import { getJournalInputFingerprint } from "./journalIdentity";

const CAS_STORE_KEY = `${config.prefsPrefix}.casState`;
const CAS_STORE_VERSION = 1;

interface CASStateStore {
  version: number;
  items: Record<string, CASItemState>;
}

let casStoreCache: CASStateStore | undefined;

function emptyCASStore(): CASStateStore {
  return { version: CAS_STORE_VERSION, items: {} };
}

function readCASStoreFromPrefs(): CASStateStore {
  const raw = Zotero.Prefs.get(CAS_STORE_KEY, true) as string;
  if (!raw) return emptyCASStore();

  try {
    const parsed = JSON.parse(raw) as CASStateStore;
    return {
      version: parsed.version || CAS_STORE_VERSION,
      items: parsed.items || {},
    };
  } catch (error) {
    ztoolkit?.log?.("Could not parse CAS state store", error);
    return emptyCASStore();
  }
}

function loadCASStore(): CASStateStore {
  if (!casStoreCache) {
    casStoreCache = readCASStoreFromPrefs();
  }
  return casStoreCache;
}

function saveCASStore(store: CASStateStore) {
  casStoreCache = store;
  Zotero.Prefs.set(CAS_STORE_KEY, JSON.stringify(store), true);
}

export function getCASItemKey(item: Zotero.Item): string {
  return `${item.libraryID}:${item.id}`;
}

export function clearCASStorageMemoryCache() {
  casStoreCache = undefined;
}

export function getStoredCASState(
  item: Zotero.Item,
  catalogVersion: string,
): CASItemState | undefined {
  const state = loadCASStore().items[getCASItemKey(item)];
  if (!state) return undefined;
  if (state.source === "manual") return state;
  if (
    state.catalogVersion === catalogVersion &&
    state.matcherVersion === getCASMatcherVersion() &&
    state.inputFingerprint === getJournalInputFingerprint(item)
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
