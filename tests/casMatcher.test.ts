import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCASIndex, matchCASItem } from "../src/modules/casMatcher";
import { CASCatalog } from "../src/modules/casTypes";
import {
  extractISSNs,
  getJournalInputFingerprint,
  normalizeISSN,
  normalizeJournalTitle,
} from "../src/modules/journalIdentity";

function makeItem(
  fields: Record<string, string>,
  itemType = "journalArticle",
  id = 1000,
): Zotero.Item {
  return {
    libraryID: 1,
    id,
    itemType,
    getField(field: string) {
      return fields[field] || "";
    },
  } as unknown as Zotero.Item;
}

const fixtureCatalog: CASCatalog = {
  version: "CAS-2025-official-pending-fixture",
  edition: "fixture",
  year: 2025,
  updateDate: "2026-08-25",
  source: "Test fixture only; not a production CAS catalog.",
  redistribution: "private-only",
  journals: [
    {
      key: "scientific-reports",
      title: "Scientific Reports",
      abbreviation: "Sci Rep",
      aliases: ["Scientific Reports"],
      issn: ["2045-2322"],
      majorPlacements: [{ category: "综合性期刊", zone: 2 }],
      minorPlacements: [
        { category: "MULTIDISCIPLINARY SCIENCES", zone: 2 },
      ],
      isTop: true,
      evidence: "fixture-row-1",
    },
    {
      key: "computer-science-review",
      title: "Computer Science Review",
      abbreviation: "Comput. Sci. Rev.",
      issn: ["1574-0137"],
      eissn: ["1876-7745"],
      majorPlacements: [{ category: "计算机科学", zone: 1 }],
      minorPlacements: [{ category: "COMPUTER SCIENCE, THEORY & METHODS", zone: 1 }],
      evidence: "fixture-row-2",
    },
  ],
};

describe("CAS journal matcher", () => {
  const index = buildCASIndex(fixtureCatalog);

  it("normalizes ISSN and journal titles", () => {
    assert.equal(normalizeISSN("2045-2322"), "20452322");
    assert.equal(normalizeISSN("2045 2322"), "20452322");
    assert.equal(normalizeISSN("bad"), undefined);
    assert.deepEqual(extractISSNs("ISSN 1574-0137; eISSN 1876-7745"), [
      "15740137",
      "18767745",
    ]);
    assert.equal(
      normalizeJournalTitle("The Journal of Computer Science Review"),
      "computer science review",
    );
  });

  it("matches journals by ISSN first", () => {
    const result = matchCASItem(
      makeItem({
        publicationTitle: "Something Else",
        ISSN: "2045-2322",
      }),
      index,
    );

    assert.equal(result.status, "matched");
    assert.equal(result.journalKey, "scientific-reports");
    assert.equal(result.matchMethod, "ISSN 精确匹配");
    assert.equal(result.majorPlacements?.[0]?.zone, 2);
    assert.equal(result.isTop, true);
  });

  it("matches journals by title or abbreviation when ISSN is absent", () => {
    const byTitle = matchCASItem(
      makeItem({ publicationTitle: "COMPUTER SCIENCE REVIEW" }),
      index,
    );
    const byAbbr = matchCASItem(
      makeItem({ journalAbbreviation: "Comput. Sci. Rev." }),
      index,
    );

    assert.equal(byTitle.status, "matched");
    assert.equal(byTitle.journalKey, "computer-science-review");
    assert.equal(byAbbr.status, "matched");
    assert.equal(byAbbr.journalKey, "computer-science-review");
  });

  it("returns CAS None when a journal is identifiable but absent from the snapshot", () => {
    const result = matchCASItem(
      makeItem({ publicationTitle: "Journal of Extremely Local Experiments" }),
      index,
    );

    assert.equal(result.status, "not-listed");
    assert.equal(result.venueText, "Journal of Extremely Local Experiments");
    assert.match(result.matchMethod || "", /未命中当前 CAS 快照/);
  });

  it("returns Unknown when journal identity evidence is missing", () => {
    const result = matchCASItem(makeItem({}), index);
    assert.equal(result.status, "unknown");
  });

  it("returns N/A for non-journal item types", () => {
    const result = matchCASItem(
      makeItem({ proceedingsTitle: "ACL" }, "conferencePaper"),
      index,
    );
    assert.equal(result.status, "not-applicable");
  });

  it("changes the journal input fingerprint when identity fields change", () => {
    const first = getJournalInputFingerprint(
      makeItem({ publicationTitle: "Scientific Reports" }),
    );
    const second = getJournalInputFingerprint(
      makeItem({ publicationTitle: "Computer Science Review" }),
    );
    assert.notEqual(first, second);
  });
});
