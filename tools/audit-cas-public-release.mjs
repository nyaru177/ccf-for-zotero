import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const structureAudit = spawnSync(
  process.execPath,
  [resolve(root, "tools/audit-cas-catalog.mjs"), "--release"],
  { stdio: "inherit" },
);

if (structureAudit.status !== 0) {
  process.exit(structureAudit.status || 1);
}

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

if (!catalog.provenance) {
  issues.push("provenance is required to make the bundled snapshot traceable");
} else {
  if (
    ![
      "official-platform",
      "official-announcement",
      "authorized-institution-export",
      "authorized-file",
    ].includes(catalog.provenance.sourceKind)
  ) {
    issues.push(
      `provenance.sourceKind is ${catalog.provenance.sourceKind || "missing"}, expected official or authorized source kind`,
    );
  }
  if (!catalog.provenance.accessDate || !catalog.provenance.permissionNote) {
    issues.push("provenance.accessDate and provenance.permissionNote are required");
  }
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
