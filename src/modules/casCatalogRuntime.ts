export const CAS_CATALOG_GLOBAL_KEY = "__ccfForZoteroCASCatalog";

export function getCASCatalogRuntimeGlobal(): Record<string, unknown> {
  if (typeof _globalThis !== "undefined") {
    return _globalThis as unknown as Record<string, unknown>;
  }
  return globalThis as unknown as Record<string, unknown>;
}
