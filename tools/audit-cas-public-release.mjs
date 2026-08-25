import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "src/data/cas-journal-ranking.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const issues = [];

if (catalog.dataStatus !== "official-snapshot") {
  issues.push(
    `dataStatus is ${catalog.dataStatus || "missing"}, expected official-snapshot`,
  );
}

if (!Array.isArray(catalog.journals) || catalog.journals.length === 0) {
  issues.push("journals is empty; CAS release would not classify journals");
}

if (catalog.redistribution !== "allowed") {
  issues.push(
    `redistribution is ${catalog.redistribution || "missing"}, expected allowed for a public release`,
  );
}

if (!catalog.version || !catalog.edition || !catalog.updateDate || !catalog.source) {
  issues.push("version, edition, updateDate, and source must be filled");
}

if (!catalog.sourceHash) {
  issues.push("sourceHash is required to make the bundled snapshot auditable");
}

for (const [index, journal] of (catalog.journals || []).entries()) {
  const label = journal.key || journal.title || `row ${index + 1}`;
  if (!journal.key || !journal.title) {
    issues.push(`${label}: key and title are required`);
  }
  if (!journal.issn?.length && !journal.eissn?.length) {
    issues.push(`${label}: at least one ISSN/eISSN is required`);
  }
  if (!journal.majorPlacements?.length && !journal.minorPlacements?.length) {
    issues.push(`${label}: at least one major or minor CAS placement is required`);
  }
}

if (issues.length) {
  console.error("CAS public release audit failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `CAS public release audit passed: ${catalog.journals.length} journals, ${catalog.version}`,
);
