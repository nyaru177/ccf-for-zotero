import { buildCASIndex, CASIndex } from "./casMatcher";
import { CASCatalog } from "./casTypes";
import {
  CAS_CATALOG_GLOBAL_KEY,
  getCASCatalogRuntimeGlobal,
} from "./casCatalogRuntime";

export const CAS_CATALOG_VERSION = "CAS-2025-showjcr";
const CAS_CATALOG_EDITION = "2025 升级版";
const CAS_CATALOG_JOURNAL_COUNT = 21772;
const CAS_CATALOG_DATA_STATUS = "third-party-snapshot" as const;

let casCatalog: CASCatalog | undefined;
let casCatalogPromise: Promise<CASCatalog> | undefined;

let casIndex: CASIndex | undefined;
const CAS_CATALOG_SCRIPT = "ccf-for-zotero-cas-catalog.js";

function getLoadedCASCatalog(): CASCatalog | undefined {
  const candidate = getCASCatalogRuntimeGlobal()[CAS_CATALOG_GLOBAL_KEY];
  if (!candidate || typeof candidate !== "object") return undefined;
  const catalog = candidate as CASCatalog;
  return Array.isArray(catalog.journals) ? catalog : undefined;
}

export async function ensureCASCatalog(): Promise<CASCatalog> {
  if (casCatalog) return casCatalog;
  if (!casCatalogPromise) {
    casCatalogPromise = (async () => {
      let loaded = getLoadedCASCatalog();
      if (!loaded) {
        if (typeof Services === "undefined" || typeof rootURI === "undefined") {
          throw new Error(
            "CAS catalog runtime script is unavailable outside Zotero",
          );
        }
        try {
          Services.scriptloader.loadSubScript(
            `${rootURI}/content/scripts/${CAS_CATALOG_SCRIPT}`,
            getCASCatalogRuntimeGlobal(),
          );
        } catch (error) {
          ztoolkit.log("Could not load bundled CAS catalog script", error);
          throw error;
        }
        loaded = getLoadedCASCatalog();
      }
      if (!loaded) {
        throw new Error("CAS catalog runtime script did not expose a catalog");
      }
      casCatalog = loaded;
      casIndex = undefined;
      return loaded;
    })().catch((error) => {
      casCatalogPromise = undefined;
      throw error;
    });
  }
  return casCatalogPromise;
}

export function getCASCatalog(): CASCatalog {
  if (!casCatalog) {
    throw new Error("CAS catalog has not been loaded; call ensureCASCatalog() first");
  }
  return casCatalog;
}

export function getCASCatalogVersion(): string {
  return CAS_CATALOG_VERSION;
}

export function getCASIndex(): CASIndex {
  if (!casIndex) {
    casIndex = buildCASIndex(getCASCatalog());
  }
  return casIndex;
}

export function hasBundledCASSnapshot(): boolean {
  return ["official-snapshot", "third-party-snapshot"].includes(
    CAS_CATALOG_DATA_STATUS,
  );
}

export function getCASCatalogStatusText(): string {
  if (hasBundledCASSnapshot()) {
    const statusLabel =
      CAS_CATALOG_DATA_STATUS === "third-party-snapshot"
        ? "第三方公开快照"
        : "官方/授权快照";
    return (
      CAS_CATALOG_EDITION +
      "，" +
      String(CAS_CATALOG_JOURNAL_COUNT) +
      " 本期刊，" +
      statusLabel
    );
  }
  return "未内置官方/授权 CAS 全量快照";
}
