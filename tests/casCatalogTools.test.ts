import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const root = resolve(import.meta.dirname, "..");

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("CAS catalog build tools", () => {
  it("builds and audits a runtime CAS catalog from an authorized export shape", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ccf-cas-catalog-"));
    const outputPath = join(tempDir, "cas-journal-ranking.json");

    try {
      const build = runNode([
        "tools/build-cas-catalog-from-official-export.mjs",
        "--input",
        "tests/fixtures/cas-official-export.sample.json",
        "--output",
        outputPath,
        "--version",
        "CAS-2025-authorized-fixture",
        "--edition",
        "2025 fixture",
        "--source",
        "Authorized CAS export fixture for tool regression tests",
        "--update-date",
        "2026-08-25",
        "--redistribution",
        "private-only",
      ]);

      assert.equal(build.status, 0, build.stderr || build.stdout);
      assert.match(build.stdout, /Wrote 2 CAS journals/);

      const catalog = JSON.parse(readFileSync(outputPath, "utf8"));
      assert.equal(catalog.version, "CAS-2025-authorized-fixture");
      assert.equal(catalog.edition, "2025 fixture");
      assert.equal(catalog.year, 2025);
      assert.equal(catalog.redistribution, "private-only");
      assert.equal(catalog.dataStatus, "official-snapshot");
      assert.match(catalog.sourceHash, /^sha256:[0-9a-f]{64}$/);
      assert.equal(catalog.journals.length, 2);

      const csr = catalog.journals.find(
        (journal: { key: string }) => journal.key === "computer-science-review",
      );
      assert.deepEqual(csr.issn, ["1574-0137"]);
      assert.deepEqual(csr.eissn, ["1876-7745"]);
      assert.deepEqual(csr.aliases, ["CSR", "Computer Sci Review"]);
      assert.deepEqual(csr.majorPlacements, [
        { category: "计算机科学", zone: 1 },
      ]);
      assert.deepEqual(csr.minorPlacements, [
        { category: "COMPUTER SCIENCE, THEORY & METHODS", zone: 1 },
      ]);
      assert.equal(csr.isWarned, true);

      const audit = runNode([
        "tools/audit-cas-catalog.mjs",
        "--input",
        outputPath,
      ]);

      assert.equal(audit.status, 0, audit.stderr || audit.stdout);
      assert.match(audit.stdout, /CAS catalog audit passed: 2 journals/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds a CAS catalog from a CSV export without misreading false booleans", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ccf-cas-catalog-csv-"));
    const outputPath = join(tempDir, "cas-journal-ranking.json");

    try {
      const build = runNode([
        "tools/build-cas-catalog-from-official-export.mjs",
        "--input",
        "tests/fixtures/cas-official-export.sample.csv",
        "--output",
        outputPath,
        "--version",
        "CAS-2025-authorized-csv-fixture",
        "--edition",
        "2025 CSV fixture",
        "--source",
        "Authorized CAS CSV export fixture for tool regression tests",
        "--update-date",
        "2026-08-25",
        "--redistribution",
        "private-only",
      ]);

      assert.equal(build.status, 0, build.stderr || build.stdout);

      const catalog = JSON.parse(readFileSync(outputPath, "utf8"));
      assert.equal(catalog.journals.length, 2);

      const csr = catalog.journals.find(
        (journal: { key: string }) => journal.key === "computer-science-review",
      );
      assert.equal(csr.titleZh, "计算机科学评论");
      assert.deepEqual(csr.issn, ["1574-0137"]);
      assert.deepEqual(csr.eissn, ["1876-7745"]);
      assert.deepEqual(csr.majorPlacements, [
        { category: "计算机科学", zone: 1 },
      ]);
      assert.deepEqual(csr.minorPlacements, [
        { category: "COMPUTER SCIENCE, THEORY & METHODS", zone: 1 },
      ]);
      assert.equal(csr.isTop, false);
      assert.equal(csr.isWarned, true);

      const reports = catalog.journals.find(
        (journal: { key: string }) => journal.key === "scientific-reports",
      );
      assert.equal(reports.isTop, false);
      assert.equal(reports.isWarned, false);

      const audit = runNode([
        "tools/audit-cas-catalog.mjs",
        "--input",
        outputPath,
      ]);

      assert.equal(audit.status, 0, audit.stderr || audit.stdout);
      assert.match(audit.stdout, /CAS catalog audit passed: 2 journals/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
