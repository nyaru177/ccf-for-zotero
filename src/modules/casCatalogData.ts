import catalogData from "../data/cas-journal-ranking.json";
import { CASCatalog } from "./casTypes";
import {
  CAS_CATALOG_GLOBAL_KEY,
  getCASCatalogRuntimeGlobal,
} from "./casCatalogRuntime";

const catalog = catalogData as CASCatalog;

// This module is bundled as a separate classic script and loaded on demand.
getCASCatalogRuntimeGlobal()[CAS_CATALOG_GLOBAL_KEY] = catalog;

export default catalog;
