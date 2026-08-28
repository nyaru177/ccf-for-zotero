import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

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
    "  node tools/build-cas-catalog-from-official-export.mjs --input official.json --output src/data/cas-journal-ranking.json --catalog-version CAS-2025-official --edition 2025-upgraded --source \"fenqubiao official export\"",
    "  node tools/build-cas-catalog-from-official-export.mjs --input official.csv --format csv --catalog-version CAS-2025-official --edition 2025-upgraded --source \"fenqubiao official export\"",
    "",
    "Required:",
    "  --input         JSON/CSV/TSV exported from the official/authorized CAS source or approved third-party snapshot",
    "  --catalog-version Catalog version written into plugin state",
    "  --edition       Human-readable edition label",
    "  --source        Source description for audit and release notes",
    "  --source-kind   official-platform|official-announcement|authorized-institution-export|authorized-file|third-party-public-repack",
    "  --permission-note Short note explaining the redistribution/use permission",
    "",
    "Optional:",
    "  --output        Defaults to src/data/cas-journal-ranking.json",
    "  --format        json|csv|tsv, defaults to input extension",
    "  --source-url    Official URL or institution page, when available",
    "  --access-date   Defaults to today",
    "  --data-status   official-snapshot|third-party-snapshot|fixture, defaults to official-snapshot",
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

function parseDelimited(textValue, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < textValue.length; index++) {
    const char = textValue[index];
    const next = textValue[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function rowsFromDelimited(rawText, delimiter) {
  const table = parseDelimited(rawText.replace(/^\uFEFF/, ""), delimiter);
  if (table.length < 2) {
    throw new Error("CSV/TSV input must contain a header row and at least one data row");
  }

  const headers = table[0].map((header) => header.trim());
  return table.slice(1).map((values) => {
    const row = {};
    for (const [index, header] of headers.entries()) {
      if (!header) continue;
      row[header] = values[index]?.trim() || "";
    }
    return row;
  });
}

function readRows(inputPath, raw, requestedFormat) {
  const format =
    requestedFormat ||
    (extname(inputPath).toLowerCase() === ".csv"
      ? "csv"
      : extname(inputPath).toLowerCase() === ".tsv"
        ? "tsv"
        : "json");

  if (format === "json") {
    return asArray(JSON.parse(raw.toString("utf8")));
  }
  if (format === "csv") {
    return rowsFromDelimited(raw.toString("utf8"), ",");
  }
  if (format === "tsv") {
    return rowsFromDelimited(raw.toString("utf8"), "\t");
  }

  throw new Error(`Unsupported --format "${format}". Use json, csv, or tsv.`);
}

function text(value) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function firstText(row, keys) {
  for (const key of keys) {
    if (typeof row[key] === "object") continue;
    const value = text(row[key]);
    if (value) return value;
  }
  return undefined;
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "object") continue;
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return undefined;
}

function firstStructured(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return value;
  }
  return undefined;
}

function splitList(value) {
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/[;|\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function bool(value) {
  if (typeof value === "boolean") return value;
  const raw = text(value);
  if (!raw) return false;
  if (/预警/.test(raw)) return true;
  return /^(1|true|yes|y|top|是|有|预警)$/i.test(raw);
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

function splitISSNPair(value) {
  const values = splitISSNs(value);
  if (!values.length) return { issn: [], eissn: [] };
  const [first, ...rest] = values;
  return {
    issn: first ? [first] : [],
    eissn: [...new Set(rest.filter((entry) => entry !== first))],
  };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function zone(value) {
  const zoneText = text(value);
  const numberValue = Number(zoneText?.match(/[1-4]/)?.[0] || value);
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

function placementsFromFlat(categoryValue, zoneValue, fallbackCategory) {
  const categories = splitList(categoryValue);
  const zones = splitList(zoneValue);
  if (!categories.length && !zones.length) return [];
  const effectiveCategories = categories.length ? categories : [fallbackCategory];

  if (zones.length === 0) {
    throw new Error(`${effectiveCategories.join("; ")}: missing CAS zone`);
  }
  if (zones.length !== 1 && zones.length !== effectiveCategories.length) {
    throw new Error(
      `${effectiveCategories.join("; ")}: category count does not match zone count`,
    );
  }

  return effectiveCategories.map((category, index) => ({
    category: category || fallbackCategory,
    zone: zone(zones[index] || zones[0]),
  }));
}

function placementsFromIndexedFlat(row, categoryPrefix, zonePrefix, count, fallbackCategory) {
  const placements = [];
  for (let index = 1; index <= count; index++) {
    placements.push(
      ...placementsFromFlat(
        firstValue(row, [
          `${categoryPrefix}${index}`,
          `${categoryPrefix}${index}Category`,
          `${categoryPrefix}${index}Name`,
        ]),
        firstValue(row, [
          `${zonePrefix}${index}`,
          `${categoryPrefix}${index}分区`,
          `${categoryPrefix}${index}Zone`,
          `${categoryPrefix}${index}Section`,
        ]),
        fallbackCategory,
      ),
    );
  }
  return placements;
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

function uniqueJournalKeys(journals) {
  const seen = new Map();
  return journals.map((journal, index) => {
    const count = seen.get(journal.key) || 0;
    seen.set(journal.key, count + 1);
    if (count === 0) return journal;

    const suffix =
      normalizeISSN(journal.issn?.[0] || journal.eissn?.[0]) || `row-${index + 1}`;
    return {
      ...journal,
      key: `${journal.key}-${suffix.toLowerCase()}`,
    };
  });
}

function toJournal(row, index) {
  const title = firstText(row, [
    "Title",
    "title",
    "FullTitle",
    "fullTitle",
    "Journal",
    "journal",
    "JournalTitle",
    "journalTitle",
    "PublicationTitle",
    "publicationTitle",
    "期刊名称",
    "期刊英文名称",
    "英文刊名",
    "刊名",
  ]);
  if (!title) {
    throw new Error(`Row ${index + 1} is missing Title`);
  }

  const issnPair = splitISSNPair(
    firstValue(row, [
      "ISSN/EISSN",
      "ISSN/eISSN",
      "ISSN / EISSN",
      "ISSN / eISSN",
      "ISSN_EISSN",
      "ISSNAndEISSN",
    ]),
  );
  const issn = uniqueValues([
    ...splitISSNs(
      firstValue(row, ["ISSN", "issn", "PrintISSN", "printISSN"]),
    ),
    ...issnPair.issn,
  ]);
  const eissn = uniqueValues([
    ...splitISSNs(
      firstValue(row, ["EISSN", "eISSN", "eissn", "E-ISSN", "e-ISSN"]),
    ),
    ...issnPair.eissn,
  ]);
  const structuredMajor = firstStructured(row, ["ZKY", "zky", "Major", "major"]);
  const structuredMinor = firstStructured(row, ["JCR", "jcr", "Minor", "minor"]);
  const structuredMajorItems = Array.isArray(structuredMajor)
    ? structuredMajor
    : structuredMajor
      ? [structuredMajor]
      : [];
  const majorPlacements = [
    ...placementsFromZKY(structuredMajor),
    ...placementsFromFlat(
      firstValue(row, [
        "MajorCategory",
        "majorCategory",
        "Major",
        "major",
        "ZKYCategory",
        "zkyCategory",
        "大类",
        "大类学科",
        "大类名称",
      ]),
      firstValue(row, [
        "MajorZone",
        "majorZone",
        "MajorSection",
        "majorSection",
        "ZKYZone",
        "zkyZone",
        "ZKYSection",
        "zkySection",
        "大类分区",
        "大类分区升级版",
      ]),
      "未命名大类",
    ),
  ];
  const minorPlacements = [
    ...placementsFromJCR(structuredMinor),
    ...placementsFromIndexedFlat(row, "小类", "小类分区", 6, "未命名小类"),
    ...placementsFromIndexedFlat(row, "MinorCategory", "MinorZone", 6, "未命名小类"),
    ...placementsFromIndexedFlat(row, "minorCategory", "minorZone", 6, "未命名小类"),
    ...placementsFromFlat(
      firstValue(row, [
        "MinorCategory",
        "minorCategory",
        "Minor",
        "minor",
        "JCRCategory",
        "jcrCategory",
        "小类",
        "小类学科",
        "小类名称",
      ]),
      firstValue(row, [
        "MinorZone",
        "minorZone",
        "MinorSection",
        "minorSection",
        "JCRZone",
        "jcrZone",
        "JCRSection",
        "jcrSection",
        "小类分区",
      ]),
      "未命名小类",
    ),
  ];

  if (!issn.length && !eissn.length) {
    throw new Error(`${title}: missing ISSN/eISSN`);
  }
  if (!majorPlacements.length && !minorPlacements.length) {
    throw new Error(`${title}: missing major/minor CAS placements`);
  }

  return {
    key: slug(title, `journal-${index + 1}`),
    title,
    titleZh: firstText(row, [
      "TitleCN",
      "titleCN",
      "TitleZh",
      "titleZh",
      "中文刊名",
      "中文名称",
    ]),
    abbreviation: firstText(row, [
      "AbbrTitle",
      "abbrTitle",
      "Abbreviation",
      "abbreviation",
      "简称",
      "刊名简称",
    ]),
    aliases: [
      firstText(row, ["OldTitle", "oldTitle", "旧刊名"]),
      firstText(row, ["Alias", "alias", "别名"]),
      firstText(row, ["Aliases", "aliases", "其他名称"]),
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[;|]/).map((entry) => entry.trim()))
      .filter(Boolean),
    issn,
    eissn,
    majorPlacements,
    minorPlacements,
    isTop:
      bool(firstValue(row, ["Top", "top", "TOP", "是否Top", "是否TOP", "Top期刊"])) ||
      majorPlacements.some((_placement, placementIndex) =>
        bool(structuredMajorItems[placementIndex]?.Top),
      ),
    isWarned: bool(
      firstValue(row, [
        "Warned",
        "warned",
        "Warning",
        "warning",
        "标注",
        "备注",
        "是否预警",
        "预警",
        "预警期刊",
      ]),
    ),
    evidence: firstText(row, [
      "evidence",
      "Evidence",
      "RowID",
      "rowID",
      "SourceRow",
      "sourceRow",
      "来源行",
    ]) || `row-${index + 1}`,
  };
}

const args = parseArgs(process.argv.slice(2));
const catalogVersion = args["catalog-version"] || args.version;
if (
  !args.input ||
  !catalogVersion ||
  !args.edition ||
  !args.source ||
  !args["source-kind"] ||
  !args["permission-note"]
) {
  console.error(usage());
  process.exit(2);
}

const inputPath = resolve(args.input);
const outputPath = resolve(args.output || "src/data/cas-journal-ranking.json");
const raw = readFileSync(inputPath);
const sourceHash = createHash("sha256").update(raw).digest("hex");
const rows = readRows(inputPath, raw, args.format);
const journals = uniqueJournalKeys(
  rows.map(toJournal).sort((a, b) => a.title.localeCompare(b.title)),
);
const detectedYear = Number(
  rows.find((row) => firstValue(row, ["Year", "year", "年份"]))?.Year ||
    rows.find((row) => firstValue(row, ["Year", "year", "年份"]))?.year ||
    rows.find((row) => firstValue(row, ["Year", "year", "年份"]))?.["年份"],
);
const year = Number(args.year || detectedYear || new Date().getFullYear());
const today = new Date().toISOString().slice(0, 10);

const catalog = {
  version: catalogVersion,
  edition: args.edition,
  year,
  updateDate: args["update-date"] || today,
  source: args.source,
  sourceHash: `sha256:${sourceHash}`,
  provenance: {
    sourceKind: args["source-kind"],
    sourceURL: args["source-url"],
    accessDate: args["access-date"] || today,
    permissionNote: args["permission-note"],
  },
  redistribution: args.redistribution || "private-only",
  dataStatus: args["data-status"] || "official-snapshot",
  journals,
};

writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${journals.length} CAS journals to ${outputPath}`);
