import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeISSN(value) {
  const normalized = text(value).toUpperCase().replace(/[^0-9X]/g, "");
  return /^[0-9]{7}[0-9X]$/.test(normalized) ? normalized : "";
}

function normalizeTitle(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/\b(the|journal of)\b/gi, " ")
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pushMap(map, key, label) {
  if (!key) return;
  const values = map.get(key) || [];
  values.push(label);
  map.set(key, values);
}

function duplicateEntries(map) {
  return [...map.entries()].filter((entry) => entry[1].length > 1);
}

const allowedSourceKinds = new Set([
  "official-platform",
  "official-announcement",
  "authorized-institution-export",
  "authorized-file",
  "third-party-public-repack",
  "fixture",
  "unknown",
]);

const snapshotStatuses = new Set(["official-snapshot", "third-party-snapshot"]);

function validatePlacementArray(journalLabel, label, placements, errors) {
  if (placements === undefined) return 0;
  if (!Array.isArray(placements)) {
    errors.push(`${journalLabel}: ${label} must be an array`);
    return 0;
  }

  for (const [index, placement] of placements.entries()) {
    const prefix = `${journalLabel}: ${label}[${index}]`;
    if (!text(placement?.category)) {
      errors.push(`${prefix}.category is required`);
    }
    if (![1, 2, 3, 4].includes(Number(placement?.zone))) {
      errors.push(`${prefix}.zone must be 1, 2, 3, or 4`);
    }
  }

  return placements.length;
}

const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(
  root,
  text(args.input) || "src/data/cas-journal-ranking.json",
);
const releaseMode = Boolean(args.release);
const catalog = JSON.parse(readFileSync(inputPath, "utf8"));
const errors = [];
const warnings = [];

if (!text(catalog.version)) errors.push("catalog.version is required");
if (!Number.isInteger(Number(catalog.year))) errors.push("catalog.year is required");
if (!text(catalog.updateDate)) errors.push("catalog.updateDate is required");
if (!text(catalog.source)) errors.push("catalog.source is required");
if (
  ![
    "official-snapshot",
    "third-party-snapshot",
    "metadata-only",
    "fixture",
  ].includes(catalog.dataStatus)
) {
  errors.push(
    "catalog.dataStatus must be official-snapshot, third-party-snapshot, metadata-only, or fixture",
  );
}
if (!["allowed", "private-only", "unknown"].includes(catalog.redistribution)) {
  errors.push("catalog.redistribution must be allowed, private-only, or unknown");
}
if (!Array.isArray(catalog.journals)) {
  errors.push("catalog.journals must be an array");
}
if (catalog.sourceHash && !/^sha256:[0-9a-f]{64}$/i.test(catalog.sourceHash)) {
  errors.push("catalog.sourceHash must look like sha256:<64 hex chars>");
}
if (!catalog.sourceHash && snapshotStatuses.has(catalog.dataStatus)) {
  errors.push("CAS snapshots must include catalog.sourceHash");
}

const provenance = catalog.provenance || {};
if (catalog.provenance) {
  if (!allowedSourceKinds.has(provenance.sourceKind)) {
    errors.push(
      "catalog.provenance.sourceKind must be official-platform, official-announcement, authorized-institution-export, authorized-file, third-party-public-repack, fixture, or unknown",
    );
  }
  if (provenance.accessDate && !/^\d{4}-\d{2}-\d{2}$/.test(provenance.accessDate)) {
    errors.push("catalog.provenance.accessDate must use YYYY-MM-DD");
  }
}

if (snapshotStatuses.has(catalog.dataStatus)) {
  if (!catalog.provenance) {
    errors.push("CAS snapshots must include catalog.provenance");
  }
  if (!text(provenance.sourceKind)) {
    errors.push("CAS snapshots must include catalog.provenance.sourceKind");
  }
  if (["fixture", "unknown"].includes(provenance.sourceKind)) {
    errors.push("CAS snapshots cannot use fixture/unknown sourceKind");
  }
  if (!text(provenance.accessDate)) {
    errors.push("CAS snapshots must include catalog.provenance.accessDate");
  }
  if (!text(provenance.permissionNote)) {
    errors.push("CAS snapshots must include catalog.provenance.permissionNote");
  }
}

const journals = Array.isArray(catalog.journals) ? catalog.journals : [];
if (catalog.dataStatus === "metadata-only") {
  if (journals.length > 0) {
    errors.push("metadata-only catalog must not contain journal rows");
  }
  warnings.push("metadata-only CAS catalog: runtime will show CAS data missing");
} else if (journals.length === 0) {
  errors.push(`${catalog.dataStatus} catalog must contain at least one journal`);
}

if (releaseMode) {
  if (catalog.dataStatus !== "official-snapshot") {
    errors.push("release mode requires dataStatus=official-snapshot");
  }
  if (journals.length === 0) {
    errors.push("release mode requires a non-empty journal catalog");
  }
  if (catalog.redistribution !== "allowed") {
    errors.push("release mode requires redistribution=allowed");
  }
  if (!catalog.sourceHash) {
    errors.push("release mode requires catalog.sourceHash");
  }
}

const byKey = new Map();
const byTitle = new Map();
const byISSN = new Map();
const zoneCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
let journalsWithISSN = 0;
let journalsWithMajor = 0;
let journalsWithMinor = 0;
let topCount = 0;
let warnedCount = 0;

for (const [index, journal] of journals.entries()) {
  const label = text(journal?.key) || text(journal?.title) || `row ${index + 1}`;

  if (!text(journal?.key)) errors.push(`${label}: key is required`);
  if (!text(journal?.title)) errors.push(`${label}: title is required`);
  pushMap(byKey, text(journal?.key), label);
  pushMap(byTitle, normalizeTitle(journal?.title), label);
  if (journal?.titleZh) pushMap(byTitle, normalizeTitle(journal.titleZh), label);

  const issns = [];
  for (const value of [...(journal?.issn || []), ...(journal?.eissn || [])]) {
    const normalized = normalizeISSN(value);
    if (!normalized) {
      errors.push(`${label}: invalid ISSN/eISSN "${value}"`);
      continue;
    }
    issns.push(normalized);
    pushMap(byISSN, normalized, label);
  }
  if (new Set(issns).size !== issns.length) {
    warnings.push(`${label}: duplicate ISSN/eISSN values inside the same row`);
  }
  if (issns.length > 0) journalsWithISSN += 1;
  if (issns.length === 0) errors.push(`${label}: at least one ISSN/eISSN is required`);

  const majorCount = validatePlacementArray(
    label,
    "majorPlacements",
    journal?.majorPlacements,
    errors,
  );
  const minorCount = validatePlacementArray(
    label,
    "minorPlacements",
    journal?.minorPlacements,
    errors,
  );
  if (majorCount > 0) journalsWithMajor += 1;
  if (minorCount > 0) journalsWithMinor += 1;
  if (majorCount === 0 && minorCount === 0) {
    errors.push(`${label}: at least one major or minor placement is required`);
  }

  for (const placement of [
    ...(journal?.majorPlacements || []),
    ...(journal?.minorPlacements || []),
  ]) {
    if ([1, 2, 3, 4].includes(Number(placement?.zone))) {
      zoneCounts[Number(placement.zone)] += 1;
    }
  }

  if (journal?.isTop !== undefined && typeof journal.isTop !== "boolean") {
    errors.push(`${label}: isTop must be boolean when present`);
  }
  if (journal?.isWarned !== undefined && typeof journal.isWarned !== "boolean") {
    errors.push(`${label}: isWarned must be boolean when present`);
  }
  if (journal?.isTop) topCount += 1;
  if (journal?.isWarned) warnedCount += 1;
}

for (const [key, labels] of duplicateEntries(byKey)) {
  errors.push(`duplicate journal key "${key}": ${labels.join(", ")}`);
}
for (const [title, labels] of duplicateEntries(byTitle)) {
  warnings.push(`duplicate normalized title "${title}": ${labels.join(", ")}`);
}
for (const [issn, labels] of duplicateEntries(byISSN)) {
  errors.push(`duplicate ISSN/eISSN "${issn}": ${labels.join(", ")}`);
}

if (warnings.length) {
  console.warn("CAS catalog audit warnings:");
  for (const warning of warnings.slice(0, 25)) console.warn(`- ${warning}`);
  if (warnings.length > 25) {
    console.warn(`- ... ${warnings.length - 25} more warnings omitted`);
  }
}

if (errors.length) {
  console.error("CAS catalog audit failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  [
    "CAS catalog audit passed:",
    `${journals.length} journals`,
    `${journalsWithISSN} with ISSN/eISSN`,
    `${journalsWithMajor} with major placements`,
    `${journalsWithMinor} with minor placements`,
    `zones 1/2/3/4=${zoneCounts[1]}/${zoneCounts[2]}/${zoneCounts[3]}/${zoneCounts[4]}`,
    `top=${topCount}`,
    `warned=${warnedCount}`,
    `status=${catalog.dataStatus}`,
  ].join(" "),
);
