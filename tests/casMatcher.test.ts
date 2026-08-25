import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCASCatalog,
  getCASCatalogStatusText,
  hasBundledCASSnapshot,
} from "../src/modules/casCatalog";
import {
  formatCASColumnDataForState,
  unpackCASColumnData,
} from "../src/modules/casColumn";
import {
  casJournalToManualResult,
  getCASMajorCategories,
  getCASMinorCategories,
  searchCASJournalOptions,
} from "../src/modules/casManualSelector";
import { buildCASIndex, matchCASItem } from "../src/modules/casMatcher";
import { getCASDisplayState } from "../src/modules/casService";
import { CASCatalog, CASItemState } from "../src/modules/casTypes";
import {
  clearCASStorageMemoryCache,
  getStoredCASState,
  ignoreCASItems,
  saveCASMatchResult,
  saveManualCASMatches,
} from "../src/modules/casStorage";
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
      titleZh: "计算机科学评论",
      abbreviation: "Comput. Sci. Rev.",
      aliases: ["CSR"],
      issn: ["1574-0137"],
      eissn: ["1876-7745"],
      majorPlacements: [{ category: "计算机科学", zone: 1 }],
      minorPlacements: [{ category: "COMPUTER SCIENCE, THEORY & METHODS", zone: 1 }],
      isWarned: true,
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

  it("stores CAS state in an independent private prefs key", () => {
    let rawStore = "";
    const setCalls: Array<{ key: string; value: string }> = [];
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get(key: string) {
          assert.equal(key, "extensions.ccf-for-zotero.casState");
          return rawStore;
        },
        set(key: string, value: string) {
          setCalls.push({ key, value });
          rawStore = value;
        },
      },
    };

    try {
      clearCASStorageMemoryCache();
      const item = makeItem({ ISSN: "2045-2322" }, "journalArticle", 1201);
      const result = matchCASItem(item, index);
      saveCASMatchResult(item, result, fixtureCatalog.version);
      clearCASStorageMemoryCache();

      const stored = getStoredCASState(item, fixtureCatalog.version);
      assert.equal(stored?.status, "matched");
      assert.equal(stored?.journalKey, "scientific-reports");
      assert.equal(setCalls.at(-1)?.key, "extensions.ccf-for-zotero.casState");
      assert.doesNotMatch(rawStore, /itemState/);
    } finally {
      clearCASStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("invalidates stale automatic CAS state but preserves manual and ignored state", () => {
    const originalItem = makeItem(
      { publicationTitle: "Scientific Reports" },
      "journalArticle",
      1202,
    );
    const updatedItem = makeItem(
      { publicationTitle: "Computer Science Review" },
      "journalArticle",
      1202,
    );
    const manualItem = makeItem(
      { publicationTitle: "Something Else" },
      "journalArticle",
      1203,
    );
    const ignoredItem = makeItem(
      { publicationTitle: "Anything" },
      "journalArticle",
      1204,
    );
    let rawStore = "";
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return rawStore;
        },
        set(_key: string, value: string) {
          rawStore = value;
        },
      },
    };

    try {
      clearCASStorageMemoryCache();
      saveCASMatchResult(
        originalItem,
        matchCASItem(originalItem, index),
        fixtureCatalog.version,
      );
      saveManualCASMatches(
        [manualItem],
        {
          status: "matched",
          source: "manual",
          journalKey: "scientific-reports",
          journalTitle: "Scientific Reports",
        },
        fixtureCatalog.version,
      );
      ignoreCASItems([ignoredItem]);
      clearCASStorageMemoryCache();

      assert.equal(getStoredCASState(updatedItem, fixtureCatalog.version), undefined);
      assert.equal(
        getStoredCASState(manualItem, "future-catalog")?.source,
        "manual",
      );
      assert.equal(
        getStoredCASState(ignoredItem, "future-catalog")?.status,
        "ignored",
      );
    } finally {
      clearCASStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("formats CAS column data with stable sort keys and concise tooltips", () => {
    const matched: CASItemState = {
      itemKey: "1:1301",
      status: "matched",
      source: "auto",
      journalKey: "computer-science-review",
      journalTitle: "Computer Science Review",
      abbreviation: "CSR",
      majorPlacements: [{ category: "计算机科学", zone: 1 }],
      minorPlacements: [{ category: "COMPUTER SCIENCE", zone: 1 }],
      matchedField: "ISSN",
      matchMethod: "ISSN 精确匹配",
      updatedAt: "2026-08-25T10:00:00.000Z",
    };
    const none: CASItemState = {
      itemKey: "1:1302",
      status: "not-listed",
      source: "auto",
      venueText: "Journal of Extremely Local Experiments",
      updatedAt: "2026-08-25T10:00:00.000Z",
    };
    const pending: CASItemState = {
      itemKey: "1:1303",
      status: "data-missing",
      source: "auto",
      matchMethod: "未内置官方/授权 CAS 全量快照",
      updatedAt: "2026-08-25T10:00:00.000Z",
    };

    const matchedData = unpackCASColumnData(formatCASColumnDataForState(matched));
    const noneData = unpackCASColumnData(formatCASColumnDataForState(none));
    const pendingData = unpackCASColumnData(
      formatCASColumnDataForState(pending),
    );

    assert.equal(matchedData.display, "CAS 1区 | CSR");
    assert.match(matchedData.sortKey, /^001\|/);
    assert.match(matchedData.title, /大类：计算机科学 1区/);
    assert.match(matchedData.title, /ISSN 精确匹配/);
    assert.equal(
      noneData.display,
      "CAS None | Journal of Extremely Local Experiments",
    );
    assert.match(noneData.sortKey, /^700\|/);
    assert.equal(pendingData.display, "CAS 数据未内置");
    assert.match(pendingData.sortKey, /^950\|/);
  });

  it("searches CAS manual options by ISSN, title, abbreviation, category, and filters", () => {
    assert.equal(
      searchCASJournalOptions("2045-2322", {}, 5, fixtureCatalog)[0]?.journal.key,
      "scientific-reports",
    );
    assert.equal(
      searchCASJournalOptions("计算机科学评论", {}, 5, fixtureCatalog)[0]?.journal.key,
      "computer-science-review",
    );
    assert.equal(
      searchCASJournalOptions("CSR", {}, 5, fixtureCatalog)[0]?.journal.key,
      "computer-science-review",
    );
    assert.equal(
      searchCASJournalOptions(
        "theory methods",
        { zone: 1, minorCategory: "COMPUTER SCIENCE, THEORY & METHODS" },
        5,
        fixtureCatalog,
      )[0]?.journal.key,
      "computer-science-review",
    );
    assert.equal(
      searchCASJournalOptions("", { flag: "top" }, 5, fixtureCatalog)[0]?.journal.key,
      "scientific-reports",
    );
    assert.equal(
      searchCASJournalOptions("", { flag: "warned" }, 5, fixtureCatalog)[0]?.journal.key,
      "computer-science-review",
    );
    assert.deepEqual(new Set(getCASMajorCategories(fixtureCatalog)), new Set([
      "综合性期刊",
      "计算机科学",
    ]));
    assert.deepEqual(getCASMinorCategories(fixtureCatalog), [
      "COMPUTER SCIENCE, THEORY & METHODS",
      "MULTIDISCIPLINARY SCIENCES",
    ]);
  });

  it("converts a CAS journal into a manual match result", () => {
    const result = casJournalToManualResult(fixtureCatalog.journals[1]);
    assert.equal(result.status, "matched");
    assert.equal(result.source, "manual");
    assert.equal(result.journalKey, "computer-science-review");
    assert.equal(result.abbreviation, "Comput. Sci. Rev.");
    assert.deepEqual(result.issn, ["15740137", "18767745"]);
    assert.equal(result.majorPlacements?.[0]?.zone, 1);
    assert.equal(result.matchMethod, "用户手动选择 CAS 期刊");
  });

  it("reports the bundled CAS snapshot when production data is present", () => {
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return "";
        },
      },
    };

    try {
      clearCASStorageMemoryCache();
      const catalog = getCASCatalog();
      assert.equal(hasBundledCASSnapshot(), true);
      assert.equal(catalog.dataStatus, "third-party-snapshot");
      assert.ok(catalog.journals.length > 20000);
      assert.match(getCASCatalogStatusText(), /第三方公开快照/);
      const state = getCASDisplayState(
        makeItem({ ISSN: "0360-0300" }, "journalArticle", 1304),
      );
      assert.equal(state.status, "matched");
      assert.equal(state.journalKey, "acm-computing-surveys");

      const ipm = getCASDisplayState(
        makeItem(
          { publicationTitle: "Information Processing & Management" },
          "journalArticle",
          1305,
        ),
      );
      const ipmData = unpackCASColumnData(formatCASColumnDataForState(ipm));
      assert.equal(ipm.status, "matched");
      assert.equal(ipm.journalKey, "information-processing-and-management");
      assert.equal(ipm.majorPlacements?.[0]?.zone, 1);
      assert.equal(ipmData.display, "CAS 1区 | INFORMATION PROCESSING & MANAGEMENT");
    } finally {
      clearCASStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });
});
