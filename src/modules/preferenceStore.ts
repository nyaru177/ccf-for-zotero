interface PreferenceChunkManifest {
  version: 1;
  chunks: number;
  length: number;
}

const MANIFEST_SUFFIX = ".manifest";
const CHUNK_SUFFIX = ".chunk.";
// Keep each individual preference comfortably below Gecko preference limits.
const MAX_CHUNK_LENGTH = 32 * 1024;

function manifestKey(key: string): string {
  return key + MANIFEST_SUFFIX;
}

function chunkKey(key: string, index: number): string {
  return key + CHUNK_SUFFIX + String(index);
}

function parseManifest(value: unknown): PreferenceChunkManifest | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<PreferenceChunkManifest>;
    const chunks = parsed.chunks;
    const length = parsed.length;
    if (
      parsed.version !== 1 ||
      !Number.isInteger(chunks) ||
      chunks === undefined ||
      chunks < 1 ||
      !Number.isInteger(length) ||
      length === undefined ||
      length < 0
    ) {
      return undefined;
    }
    return { version: 1, chunks, length };
  } catch {
    return undefined;
  }
}

function parseValue<T>(raw: unknown): T | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function readJSONPreference<T>(key: string, emptyValue: T): T {
  // Read the legacy key first for backwards compatibility and to avoid an
  // extra preference lookup for the normal small-store path.
  const legacyRaw = Zotero.Prefs.get(key, true);
  const legacyValue = parseValue<T>(legacyRaw);
  if (legacyValue !== undefined) return legacyValue;
  // Zotero test doubles and older profiles commonly return an empty string
  // for an absent preference. Do not probe the manifest in that case.
  if (legacyRaw === "") return emptyValue;

  let manifestRaw: unknown;
  try {
    manifestRaw = Zotero.Prefs.get(manifestKey(key), true);
  } catch {
    return emptyValue;
  }
  const manifest = parseManifest(manifestRaw);
  if (manifest) {
    let serialized = "";
    let complete = true;
    for (let index = 0; index < manifest.chunks; index++) {
      const chunk = Zotero.Prefs.get(chunkKey(key, index), true);
      if (typeof chunk !== "string") {
        complete = false;
        break;
      }
      serialized += chunk;
    }
    if (complete && serialized.length === manifest.length) {
      const value = parseValue<T>(serialized);
      if (value !== undefined) return value;
    }
  }

  return emptyValue;
}

export function writeJSONPreference<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_CHUNK_LENGTH) {
    Zotero.Prefs.set(key, serialized, true);
    try {
      Zotero.Prefs.clear(manifestKey(key), true);
    } catch {
      // The legacy key is still a complete valid snapshot.
    }
    return;
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length; offset += MAX_CHUNK_LENGTH) {
    chunks.push(serialized.slice(offset, offset + MAX_CHUNK_LENGTH));
  }
  if (chunks.length === 0) chunks.push("");

  const oldManifest = parseManifest(Zotero.Prefs.get(manifestKey(key), true));
  for (let index = 0; index < chunks.length; index++) {
    Zotero.Prefs.set(chunkKey(key, index), chunks[index], true);
  }

  // Publish the manifest last so a partial write keeps the previous snapshot readable.
  Zotero.Prefs.set(
    manifestKey(key),
    JSON.stringify({
      version: 1,
      chunks: chunks.length,
      length: serialized.length,
    } satisfies PreferenceChunkManifest),
    true,
  );

  // The old single-preference snapshot is only a migration fallback. Clear it after
  // the chunk manifest is visible so future reads use the bounded representation.
  try {
    Zotero.Prefs.clear(key, true);
  } catch {
    // Clearing is best-effort; a valid manifest still takes precedence on reads.
  }

  if (oldManifest && oldManifest.chunks > chunks.length) {
    for (let index = chunks.length; index < oldManifest.chunks; index++) {
      try {
        Zotero.Prefs.clear(chunkKey(key, index), true);
      } catch {
        // Stale chunks are harmless and can be removed on a later write.
      }
    }
  }
}
