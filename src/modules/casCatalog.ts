import catalogData from "../data/cas-journal-ranking.json";
import { buildCASIndex, CASIndex } from "./casMatcher";
import { CASCatalog } from "./casTypes";

export const casCatalog = catalogData as CASCatalog;

let casIndex: CASIndex | undefined;

export function getCASCatalog(): CASCatalog {
  return casCatalog;
}

export function getCASCatalogVersion(): string {
  return casCatalog.version;
}

export function getCASIndex(): CASIndex {
  if (!casIndex) {
    casIndex = buildCASIndex(casCatalog);
  }
  return casIndex;
}

export function hasBundledCASSnapshot(): boolean {
  return casCatalog.dataStatus === "official-snapshot" && casCatalog.journals.length > 0;
}

export function getCASCatalogStatusText(): string {
  if (hasBundledCASSnapshot()) {
    return `${casCatalog.edition || casCatalog.version}，${casCatalog.journals.length} 本期刊`;
  }
  return "未内置官方/授权 CAS 全量快照";
}
