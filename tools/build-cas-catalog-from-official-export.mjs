import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node tools/build-cas-catalog-from-official-export.mjs --input official.json --output src/data/cas-journal-ranking.json --version CAS-2025-official --edition 2025-upgraded --source \"fenqubiao official export\"",
    "",
    "Required:",
    "  --input         JSON exported from the official/authorized CAS source",
    "  --version       Catalog version written into plugin state",
    "  --edition       Human-readable edition label",
    "  --source        Source description for audit and release notes",
    "",
    "Optional:",
    "  --output        Defaults to src/data/cas-journal-ranking.json",
    "  --redistribution allowed|private-only|unknown, defaults to private-only",
    "  --update-date   Defaults to today",
    "  --year          Defaults to the first journal Year field or current year",
  ].join("\n");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.journals)) return value.journals;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.value)) return value.value;
  if (Array.isArray(value?.Data)) return value.Data;
  throw new Error("Input JSON must be an array or contain journals/data/value/Data array");
}

function text(value) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function normalizeISSN(value) {
  const candidate = text(value);
  if (!candidate) return undefined;
  const normalized = candidate.toUpperCase().replace(/[^0-9X]/g, "");
  return /^[0-9]{7}[0-9X]$/.test(normalized)
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : undefined;
}

function splitISSNs(value) {
  const raw = text(value);
  if (!raw) return [];
  return [...new Set(raw.split(/[;,/| ]+/).map(normalizeISSN).filter(Boolean))];
}

function zone(value) {
  const numberValue = Number(value);
  if ([1, 2, 3, 4].includes(numberValue)) return numberValue;
  throw new Error(`Invalid CAS zone: ${value}`);
}

function placementsFromZKY(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item) => ({
    category: text(item.Name || item.name || item.Category || item.category) || "未命名大类",
    zone: zone(item.Section || item.section || item.Zone || item.zone),
  }));
}

function placementsFromJCR(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item) => ({
    category:
      text(item.NameCN || item.nameCN || item.Name || item.name || item.Category || item.category) ||
      "未命名小类",
    zone: zone(item.Section || item.section || item.Zone || item.zone),
  }));
}

function slug(value, fallback) {
  const base = text(value) || fallback;
  return base
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toJournal(row, index) {
  const title = text(row.Title || row.title || row.FullTitle || row.fullTitle);
  if (!title) {
    throw new Error(`Row ${index + 1} is missing Title`);
  }

  const issn = splitISSNs(row.ISSN || row.issn);
  const eissn = splitISSNs(row.EISSN || row.eISSN || row.eissn);
  const majorPlacements = placementsFromZKY(row.ZKY || row.zky || row.Major || row.major);
  const minorPlacements = placementsFromJCR(row.JCR || row.jcr || row.Minor || row.minor);

  if (!issn.length && !eissn.length) {
    throw new Error(`${title}: missing ISSN/eISSN`);
  }
  if (!majorPlacements.length && !minorPlacements.length) {
    throw new Error(`${title}: missing major/minor CAS placements`);
  }

  return {
    key: slug(title, `journal-${index + 1}`),
    title,
    titleZh: text(row.TitleCN || row.titleCN || row.TitleZh || row.titleZh),
    abbreviation: text(row.AbbrTitle || row.abbrTitle || row.Abbreviation || row.abbreviation),
    aliases: [
      text(row.OldTitle || row.oldTitle),
      text(row.Alias || row.alias),
      text(row.Aliases || row.aliases),
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[;|]/).map((entry) => entry.trim()))
      .filter(Boolean),
    issn,
    eissn,
    majorPlacements,
    minorPlacements,
    isTop: Boolean(
      row.Top ||
        row.top ||
        majorPlacements.some((_placement, placementIndex) =>
          Boolean((row.ZKY || row.zky || [])[placementIndex]?.Top),
        ),
    ),
    isWarned: Boolean(row.Warned || row.warned || row.Warning || row.warning),
    evidence: text(row.evidence || row.Evidence || row.RowID || row.rowID || `row-${index + 1}`),
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.version || !args.edition || !args.source) {
  console.error(usage());
  process.exit(2);
}

const inputPath = resolve(args.input);
const outputPath = resolve(args.output || "src/data/cas-journal-ranking.json");
const raw = readFileSync(inputPath);
const sourceHash = createHash("sha256").update(raw).digest("hex");
const rows = asArray(JSON.parse(raw.toString("utf8")));
const journals = rows.map(toJournal).sort((a, b) => a.title.localeCompare(b.title));
const detectedYear = Number(rows.find((row) => row.Year || row.year)?.Year || rows.find((row) => row.Year || row.year)?.year);
const year = Number(args.year || detectedYear || new Date().getFullYear());

const catalog = {
  version: args.version,
  edition: args.edition,
  year,
  updateDate: args["update-date"] || new Date().toISOString().slice(0, 10),
  source: args.source,
  sourceHash: `sha256:${sourceHash}`,
  redistribution: args.redistribution || "private-only",
  dataStatus: "official-snapshot",
  journals,
};

writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${journals.length} CAS journals to ${outputPath}`);
