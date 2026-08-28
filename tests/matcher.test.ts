import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatColumnDataForState,
  registerCCFColumn,
  unpackColumnData,
} from "../src/modules/column";
import { formatItemDiagnostics } from "../src/modules/diagnostics";
import {
  findVenue,
  getCatalogVersion,
  getMatcherVersion,
  getVenueCount,
  matchCandidates,
} from "../src/modules/matcher";
import {
  searchVenueOptions,
  venueToManualResult,
} from "../src/modules/manualSelector";
import { formatNonCcfVenueText } from "../src/modules/nonCcfAliases";
import {
  filterItemsByDisplayStatus,
  getColumnDisplayState,
  getDisplayState,
  refreshItemsRank,
} from "../src/modules/rankService";
import { clearStorageMemoryCache, getStoredState } from "../src/modules/storage";
import {
  getItemInputFingerprint,
  resolveVenueCandidates,
} from "../src/modules/venueResolver";

function makeItem(
  fields: Record<string, string>,
  itemType = "conferencePaper",
  id = 100,
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

describe("local CCF matcher", () => {
  it("loads the CCF catalog", () => {
    assert.equal(getVenueCount(), 750);
    assert.match(getMatcherVersion(), /^0\.1\.16/);
  });

  const cases: Array<[string, string, string]> = [
    ["ACL", "A", "ACL"],
    ["Annual Meeting of the Association for Computational Linguistics", "A", "ACL"],
    ["NeurIPS", "A", "NeurIPS"],
    ["Conference on Neural Information Processing Systems", "A", "NeurIPS"],
    ["International Conference on Learning Representations", "A", "ICLR"],
    ["EMNLP", "B", "EMNLP"],
    ["COLING", "B", "COLING"],
    ["AAAI", "A", "AAAI"],
    ["IJCAI", "B", "IJCAI"],
    ["SIGIR", "A", "SIGIR"],
    ["WWW", "A", "WWW"],
    ["KDD", "A", "SIGKDD"],
    ["CVPR", "A", "CVPR"],
    ["ICCV", "A", "ICCV"],
    ["ECCV", "B", "ECCV"],
    ["ICML", "A", "ICML"],
    ["SIGMOD", "A", "SIGMOD"],
    ["VLDB", "A", "VLDB"],
    ["IEEE Transactions on Knowledge and Data Engineering", "A", "TKDE"],
    ["ACM Transactions on Information Systems", "A", "TOIS"],
    ["HotSec", "C", "HotSec"],
    ["USENIX Workshop on Hot Topics in Security", "C", "HotSec"],
    ["ICVRV", "C", "ICVRV"],
    ["International Conference on Virtual Reality and Visualization", "C", "ICVRV"],
    ["USENIX ATC", "A", "ACM SIGOPS ATC"],
    ["SoCC", "B", "SoCC"],
    ["SOCC", "B", "SoCC"],
    ["SIG-METRICS", "B", "SIGMETRICS"],
    ["RTA", "C", "FSCD"],
    ["INTER-SPEECH", "B", "INTERSPEECH"],
    ["IEEE International Conference on Peer-to-Peer Computing", "C", "P2P"],
    ["USENIX Symposium on Operating Systems Design and Implementation", "A", "OSDI"],
    ["ICSOC", "B", "CSOC"],
    ["CSOC", "B", "CSOC"],
    [
      "International Conference on Computer-Aided Design and Computer Graphics Processing",
      "C",
      "CAD/Graphics",
    ],
  ];

  for (const [input, rank, abbr] of cases) {
    it(`matches ${input}`, () => {
      const result = findVenue(input);
      assert.equal(result?.status, "matched");
      assert.equal(result?.rank, rank);
      assert.equal(result?.abbr, abbr);
    });
  }

  it("matches CCF high-quality Chinese journals without prefix false positives", () => {
    const dzxb = findVenue("电子学报", "journal");
    assert.equal(dzxb?.status, "matched");
    assert.equal(dzxb?.rank, "T1");
    assert.equal(dzxb?.abbr, "电子学报");

    const cje = findVenue("Chinese Journal of Electronics", "journal");
    assert.equal(cje?.status, "matched");
    assert.equal(cje?.rank, "T1");
    assert.equal(cje?.abbr, "Chinese Journal of Electronics");

    const jsjyy = findVenue("计算机应用", "journal");
    assert.equal(jsjyy?.status, "matched");
    assert.equal(jsjyy?.rank, "T2");
    assert.equal(jsjyy?.abbr, "计算机应用");

    const jsjyyyj = findVenue("计算机应用研究", "journal");
    assert.equal(jsjyyyj?.status, "matched");
    assert.equal(jsjyyyj?.rank, "T3");
    assert.equal(jsjyyyj?.abbr, "计算机应用研究");

    const candidateResult = matchCandidates(
      [{ value: "电子学报", field: "publicationTitle", kindHint: "journal" }],
      false,
    );
    assert.equal(candidateResult.status, "matched");
    assert.equal(candidateResult.rank, "T1");
    assert.equal(candidateResult.abbr, "电子学报");
  });

  it("returns preprint when no venue candidates exist and arXiv is detected", () => {
    const result = matchCandidates([], true);
    assert.equal(result.status, "preprint");
  });

  it("returns unknown when there is no venue or preprint signal", () => {
    const result = matchCandidates([], false);
    assert.equal(result.status, "unknown");
  });

  it("returns CCF none when a venue is present but not in CCF", () => {
    const result = matchCandidates(
      [{ value: "Journal of Extremely Local Experiments", field: "publicationTitle" }],
      false,
    );
    assert.equal(result.status, "none");
  });

  it("matches CVPR proceedings text even when word order differs from CCF full name", () => {
    const result = findVenue(
      "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      "conference",
    );
    assert.equal(result?.status, "matched");
    assert.equal(result?.rank, "A");
    assert.equal(result?.abbr, "CVPR");
  });

  it("does not classify CVPR Workshops as the PR journal", () => {
    const result = matchCandidates(
      [
        {
          value:
            "IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR) Workshops",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(result.status, "none");
    assert.equal(result.abbr, undefined);
  });

  it("does not promote Findings of ACL to ACL main conference", () => {
    const result = matchCandidates(
      [{ value: "Findings of ACL", field: "identifier", kindHint: "conference" }],
      false,
    );
    assert.equal(result.status, "none");
  });

  it("matches Scopus/IEEE abbreviated conference venue strings", () => {
    const cases: Array<[string, string]> = [
      ["Proc. - IEEE Int. Conf. Big Data, BigData", "IEEE BigData"],
      ["Proc. - IEEE Int. Conf. Bioinform. Biomed., BIBM", "BIBM"],
      ["Conf. Proc. IEEE Int. Conf. Syst. Man Cybern.", "SMC"],
    ];

    for (const [input, abbr] of cases) {
      const result = findVenue(input, "conference");
      assert.equal(result?.status, "matched");
      assert.equal(result?.abbr, abbr);
    }

    const coling = matchCandidates(
      [
        {
          value: "COLING",
          field: "proceedingsTitle:abbr",
          kindHint: "conference",
          context: "Proc. Main Conf. Int. Conf. Comput. Linguist., COLING",
        },
        {
          value: "Proc. Main Conf. Int. Conf. Comput. Linguist., COLING",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(coling.status, "matched");
    assert.equal(coling.abbr, "COLING");
  });

  it("matches main conference proceedings names visible in Zotero metadata", () => {
    const cases: Array<[string, string, string]> = [
      ["Proc IEEE INFOCOM", "A", "INFOCOM"],
      ["PROCEEDINGS OF THE ACM WEB CONFERENCE 2025, WWW 2025", "A", "WWW"],
      ["Proceedings of the ACM Web Conference 2026", "A", "WWW"],
      [
        "Proceedings of the 2024 Conference of the North American Chapter of the Association for Computational Linguistics",
        "B",
        "NAACL",
      ],
      [
        "Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics",
        "B",
        "NAACL",
      ],
    ];

    for (const [input, rank, abbr] of cases) {
      const result = findVenue(input, "conference");
      assert.equal(result?.status, "matched");
      assert.equal(result?.rank, rank);
      assert.equal(result?.abbr, abbr);
      assert.notEqual(result?.venueText, abbr);
    }
  });

  it("keeps ACL Anthology Findings proceedings as non-CCF display aliases", () => {
    const acl = matchCandidates(
      [
        {
          value: "Findings of the Association for Computational Linguistics: ACL 2024",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(acl.status, "none");
    assert.equal(
      formatNonCcfVenueText(acl.venueText),
      "Findings ACL 2024",
    );

    const emnlp = matchCandidates(
      [
        {
          value:
            "Findings of the Association for Computational Linguistics: EMNLP 2023",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(emnlp.status, "none");
    assert.equal(
      formatNonCcfVenueText(emnlp.venueText),
      "Findings EMNLP 2023",
    );
  });

  it("uses ACL Anthology DOI and URL patterns as venue evidence", () => {
    const acl = resolveVenueCandidates(
      makeItem({
        DOI: "10.18653/v1/2026.acl-long.293",
        title:
          "What's Left Unsaid? Detecting and Correcting Misleading Omissions in Multimodal News Previews",
      }),
    );
    const aclResult = matchCandidates(acl.candidates, acl.isPreprint);
    assert.equal(aclResult.status, "matched");
    assert.equal(aclResult.rank, "A");
    assert.equal(aclResult.abbr, "ACL");

    const naacl = resolveVenueCandidates(
      makeItem({ url: "https://aclanthology.org/2024.naacl-long.464/" }),
    );
    const naaclResult = matchCandidates(naacl.candidates, naacl.isPreprint);
    assert.equal(naaclResult.status, "matched");
    assert.equal(naaclResult.rank, "B");
    assert.equal(naaclResult.abbr, "NAACL");

    const findings = resolveVenueCandidates(
      makeItem({ DOI: "10.18653/v1/2026.findings-acl.107" }),
    );
    const findingsResult = matchCandidates(
      findings.candidates,
      findings.isPreprint,
    );
    assert.equal(findingsResult.status, "none");
    assert.equal(
      formatNonCcfVenueText(findingsResult.venueText),
      "Findings ACL 2026",
    );
  });

  it("uses IEEE DOI prefixes as venue evidence without forcing CCF matches", () => {
    const infocom = resolveVenueCandidates(
      makeItem({ DOI: "10.1109/INFOCOM52122.2026.1234567" }),
    );
    const infocomResult = matchCandidates(
      infocom.candidates,
      infocom.isPreprint,
    );
    assert.equal(infocomResult.status, "matched");
    assert.equal(infocomResult.rank, "A");
    assert.equal(infocomResult.abbr, "INFOCOM");

    const icmisi = resolveVenueCandidates(
      makeItem({ DOI: "10.1109/icmisi69868.2026.11584229" }),
    );
    const icmisiResult = matchCandidates(icmisi.candidates, icmisi.isPreprint);
    assert.equal(icmisiResult.status, "none");
    assert.equal(icmisiResult.venueText, "ICMISI");
  });

  it("shortens common non-CCF venue labels without changing rank state", () => {
    const cases: Array<[string, string]> = [
      ["ACM SIGKDD Explorations Newsletter", "KDD Explorations"],
      ["Artificial Intelligence Review", "AI Review"],
      [
        "EACL - Conf. Eur. Chapter Assoc. Comput. Linguist., Proc. Conf., Vol. 1 - Long Pap.",
        "EACL",
      ],
      ["FEVER - Fact Extraction VERification Workshop, Proc. Workshop", "FEVER"],
      ["FRONTIERS IN ARTIFICIAL INTELLIGENCE", "Frontiers AI"],
      ["International Journal of Multimedia Information Retrieval", "IJMIR"],
      ["Journal of Medical Internet Research", "JMIR"],
      ["Language and Linguistics Compass", "Lang. Linguist. Compass"],
      ["Lect. Notes Comput. Sci.", "LNCS"],
      ["Natural Language Processing Research", "NLP Research"],
      ["NATURE MACHINE INTELLIGENCE", "Nat. Mach. Intell."],
      [
        "Proceedings of the 5th ACM International Workshop on Multimedia AI against Disinformation",
        "MM-AI Workshop",
      ],
      ["Social Network Analysis and Mining", "SNAM"],
      ["IEEE Access", "IEEE Access"],
    ];

    for (const [input, alias] of cases) {
      assert.equal(formatNonCcfVenueText(input), alias);
    }
  });

  it("matches abbreviated IEEE journal titles", () => {
    const cases: Array<[string, string]> = [
      ["IEEE/ACM Trans. Audio, Speech and Lang. Proc.", "TASLP"],
      ["IEEE Trans. Pattern Anal. Mach. Intell.", "TPAMI"],
    ];

    for (const [input, abbr] of cases) {
      const result = findVenue(input, "journal");
      assert.equal(result?.status, "matched");
      assert.equal(result?.abbr, abbr);
    }
  });

  it("matches ACM abbreviated journal titles", () => {
    const cases: Array<[string, string, string]> = [
      ["ACM Trans. Inf. Syst.", "A", "TOIS"],
      ["ACM Trans. Softw. Eng. Methodol.", "A", "TOSEM"],
      ["ACM Trans. Intell. Syst. Technol.", "C", "TIST"],
      ["ACM Trans. Multimedia Comput. Commun. Appl.", "B", "TOMM"],
      ["ACM Trans. Knowl. Discov. Data", "B", "TKDD"],
      ["ACM Trans. Web", "B", "TWEB"],
      ["ACM Trans. Comput.-Hum. Interact.", "A", "TOCHI"],
      ["Proc. ACM Hum.-Comput. Interact.", "C", "PACMHCI"],
    ];

    for (const [input, rank, abbr] of cases) {
      const result = findVenue(input, "journal");
      assert.equal(result?.status, "matched");
      assert.equal(result?.rank, rank);
      assert.equal(result?.abbr, abbr);
    }
  });

  it("does not match unrelated venues with similar acronyms or tokens", () => {
    const cases = [
      {
        value:
          "2026 IEEE 5th International Conference on Computing and Machine Intelligence (ICMI)",
        kindHint: "conference" as const,
      },
      {
        value: "Int. Conf. Robot. Autom. Ind., ICRAI",
        kindHint: "conference" as const,
      },
      {
        value: "VFAST Transactions on Software Engineering",
        kindHint: "journal" as const,
      },
      {
        value: "Journal of Computing and Biomedical Informatics",
        kindHint: "journal" as const,
      },
      {
        value: "IEEE Security & Privacy",
        kindHint: "journal" as const,
      },
    ];

    for (const { value, kindHint } of cases) {
      const result = matchCandidates(
        [{ value, field: "publicationTitle", kindHint }],
        false,
      );
      assert.equal(result.status, "none");
      assert.equal(result.abbr, undefined);
    }
  });

  it("keeps companion and workshop proceedings strict", () => {
    const strictCases = [
      "Companion Proceedings of the ACM Web Conference 2025",
      "Proceedings of the Extended Abstracts of the CHI Conference on Human Factors in Computing Systems",
      "IEEE/CVF Conference on Computer Vision and Pattern Recognition Workshops",
    ];

    for (const value of strictCases) {
      const result = matchCandidates(
        [{ value, field: "proceedingsTitle", kindHint: "conference" }],
        false,
      );
      assert.equal(result.status, "none");
      assert.equal(result.abbr, undefined);
    }

    const hotSec = matchCandidates(
      [
        {
          value: "USENIX Workshop on Hot Topics in Security",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(hotSec.status, "matched");
    assert.equal(hotSec.abbr, "HotSec");
  });

  it("keeps high-impact non-CCF journals as CCF None", () => {
    const cases = [
      "IEEE Access",
      "Nature Communications",
      "Scientific Reports",
      "Information Fusion",
    ];

    for (const value of cases) {
      const result = matchCandidates(
        [{ value, field: "publicationTitle", kindHint: "journal" }],
        false,
      );
      assert.equal(result.status, "none");
      assert.equal(result.abbr, undefined);
    }
  });

  it("does not match short journal names embedded in longer IEEE journal titles", () => {
    const result = matchCandidates(
      [
        {
          value: "IEEE Transactions on Emerging Topics in Computational Intelligence",
          field: "publicationTitle",
          kindHint: "journal",
        },
      ],
      false,
    );
    assert.equal(result.status, "none");
  });

  it("uses context before trusting ambiguous venue abbreviations", () => {
    const falsePositive = matchCandidates(
      [
        {
          value: "ICMI",
          field: "proceedingsTitle:abbr",
          kindHint: "conference",
          context:
            "2026 IEEE 5th International Conference on Computing and Machine Intelligence (ICMI)",
        },
        {
          value:
            "2026 IEEE 5th International Conference on Computing and Machine Intelligence (ICMI)",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(falsePositive.status, "none");

    const validAlias = matchCandidates(
      [
        {
          value: "BigData",
          field: "proceedingsTitle:abbr",
          kindHint: "conference",
          context: "2024 IEEE International Conference on Big Data (BigData)",
        },
      ],
      false,
    );
    assert.equal(validAlias.status, "matched");
    assert.equal(validAlias.abbr, "IEEE BigData");
  });

  it("does not collapse longer explicit IEEE acronyms into shorter CCF acronyms", () => {
    const result = matchCandidates(
      [
        {
          value: "ICRAI",
          field: "proceedingsTitle:abbr",
          kindHint: "conference",
          context: "Int. Conf. Robot. Autom. Ind., ICRAI",
        },
        {
          value: "Int. Conf. Robot. Autom. Ind., ICRAI",
          field: "proceedingsTitle",
          kindHint: "conference",
        },
      ],
      false,
    );
    assert.equal(result.status, "none");
  });

  it("does not match bare AI as the Artificial Intelligence journal outside journal context", () => {
    assert.equal(findVenue("AI", "conference"), undefined);
    assert.equal(findVenue("AI", "journal")?.abbr, "AI");

    const titleOnly = matchCandidates(
      [{ value: "AI", field: "title" }],
      false,
    );
    assert.equal(titleOnly.status, "none");

    const journalField = matchCandidates(
      [
        {
          value: "AI",
          field: "journalAbbreviation",
          kindHint: "journal",
        },
      ],
      false,
    );
    assert.equal(journalField.status, "matched");
    assert.equal(journalField.abbr, "AI");
  });

  it("searches manual selection candidates by abbreviation, full name, type, and category", () => {
    const acmMM = searchVenueOptions("ACM MM")[0]?.venue;
    assert.equal(acmMM?.abbr, "ACM MM");
    assert.equal(acmMM?.kind, "conference");

    const aiJournal = searchVenueOptions("artificial intelligence", {
      kind: "journal",
    })[0]?.venue;
    assert.equal(aiJournal?.abbr, "AI");
    assert.equal(aiJournal?.kind, "journal");

    const multimediaConference = searchVenueOptions(
      "",
      { kind: "conference", category: "计算机图形学与多媒体", rank: "A" },
      10,
    ).some((option) => option.venue.abbr === "ACM MM");
    assert.equal(multimediaConference, true);

    const chineseJournal = searchVenueOptions("电子学报", { kind: "journal" })[0]
      ?.venue;
    assert.equal(chineseJournal?.abbr, "电子学报");
    assert.equal(chineseJournal?.rank, "T1");

    const t1HighQualityJournal = searchVenueOptions(
      "",
      { kind: "journal", category: "计算领域高质量科技期刊", rank: "T1" },
      50,
    ).some((option) => option.venue.abbr === "电子学报");
    assert.equal(t1HighQualityJournal, true);

    assert.equal(venueToManualResult(acmMM!).source, "manual");
  });

  it("searches manual selection candidates with fuzzy field keywords", () => {
    const tosem = searchVenueOptions("softw methodol", { kind: "journal" })[0]
      ?.venue;
    assert.equal(tosem?.abbr, "TOSEM");

    const theoryOptions = searchVenueOptions("theory", { kind: "conference" }, 20);
    assert.equal(
      theoryOptions.some((option) => option.venue.category === "计算机科学理论"),
      true,
    );
  });

  it("parses the Zotero prefs state store once per session", () => {
    let getCalls = 0;
    const rawStore = JSON.stringify({
      version: 1,
      items: {
        "1:100": {
          itemKey: "1:100",
          status: "matched",
          source: "auto",
          rank: "A",
          abbr: "ACL",
          catalogVersion: getCatalogVersion(),
          matcherVersion: getMatcherVersion(),
          updatedAt: "2026-08-23T00:00:00.000Z",
        },
      },
    });

    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          getCalls += 1;
          return rawStore;
        },
        set() {},
      },
    };

    try {
      clearStorageMemoryCache();
      const item = { libraryID: 1, id: 100 } as Zotero.Item;
      assert.equal(getStoredState(item)?.abbr, "ACL");
      assert.equal(getStoredState(item)?.abbr, "ACL");
      assert.equal(getCalls, 1);
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("ignores stale automatic cache but keeps manual cache", () => {
    let getCalls = 0;
    let setCalls = 0;
    const rawStore = JSON.stringify({
      version: 1,
      items: {
        "1:101": {
          itemKey: "1:101",
          status: "none",
          source: "auto",
          venueText: "Old cached venue",
          catalogVersion: "old-catalog",
          matcherVersion: "old-matcher",
          updatedAt: "2026-08-23T00:00:00.000Z",
        },
        "1:102": {
          itemKey: "1:102",
          status: "matched",
          source: "manual",
          rank: "B",
          abbr: "NAACL",
          catalogVersion: "old-catalog",
          matcherVersion: "old-matcher",
          updatedAt: "2026-08-23T00:00:00.000Z",
        },
      },
    });

    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          getCalls += 1;
          return rawStore;
        },
        set() {
          setCalls += 1;
        },
      },
    };

    try {
      clearStorageMemoryCache();
      assert.equal(
        getStoredState({ libraryID: 1, id: 101 } as Zotero.Item),
        undefined,
      );

      const recomputed = getDisplayState(
        makeItem(
          { DOI: "10.18653/v1/2026.acl-long.293" },
          "conferencePaper",
          101,
        ),
      );
      assert.equal(recomputed.status, "matched");
      assert.equal(recomputed.abbr, "ACL");

      const manual = getStoredState({ libraryID: 1, id: 102 } as Zotero.Item);
      assert.equal(manual?.source, "manual");
      assert.equal(manual?.abbr, "NAACL");
      assert.equal(getCalls, 1);
      assert.equal(setCalls, 0);
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("computes display state for uncached items without saving prefs", () => {
    let getCalls = 0;
    let setCalls = 0;
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          getCalls += 1;
          return "";
        },
        set() {
          setCalls += 1;
        },
      },
    };

    try {
      clearStorageMemoryCache();
      const state = getDisplayState(
        makeItem({ DOI: "10.18653/v1/2026.acl-long.293" }, "conferencePaper", 101),
      );
      assert.equal(state.status, "matched");
      assert.equal(state.rank, "A");
      assert.equal(state.abbr, "ACL");
      assert.equal(getCalls, 1);
      assert.equal(setCalls, 0);
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("uses a cheap display path for uncached column values", () => {
    let getCalls = 0;
    let setCalls = 0;
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          getCalls += 1;
          return "";
        },
        set() {
          setCalls += 1;
        },
      },
    };

    try {
      clearStorageMemoryCache();
      const item = makeItem(
        { DOI: "10.18653/v1/2026.acl-long.293" },
        "conferencePaper",
        110,
      );
      const state = getDisplayState(item, { computeIfMissing: false });
      assert.equal(state.status, "unknown");
      assert.equal(state.matchMethod, "无有效缓存；未在列排序路径即时计算");
      assert.equal(getCalls, 1);
      assert.equal(setCalls, 0);
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("uses refreshed CCF cache on the cheap column path", async () => {
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
      clearStorageMemoryCache();
      const item = makeItem(
        { publicationTitle: "Information Processing & Management" },
        "journalArticle",
        113,
      );
      const result = await refreshItemsRank([item]);
      assert.equal(result.entries[0]?.result.status, "matched");

      clearStorageMemoryCache();
      const state = getDisplayState(item, { computeIfMissing: false });
      assert.equal(state.status, "matched");
      assert.equal(state.rank, "B");
      assert.equal(state.abbr, "IPM");
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("invalidates automatic cache when item venue inputs change", () => {
    const originalItem = makeItem({}, "conferencePaper", 111);
    const updatedItem = makeItem(
      { DOI: "10.18653/v1/2026.acl-long.293" },
      "conferencePaper",
      111,
    );
    const manualItem = makeItem(
      { DOI: "10.18653/v1/2026.acl-long.293" },
      "conferencePaper",
      112,
    );
    const rawStore = JSON.stringify({
      version: 1,
      items: {
        "1:111": {
          itemKey: "1:111",
          status: "unknown",
          source: "auto",
          catalogVersion: getCatalogVersion(),
          matcherVersion: getMatcherVersion(),
          inputFingerprint: getItemInputFingerprint(originalItem),
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
        "1:112": {
          itemKey: "1:112",
          status: "matched",
          source: "manual",
          rank: "B",
          abbr: "NAACL",
          catalogVersion: getCatalogVersion(),
          matcherVersion: getMatcherVersion(),
          inputFingerprint: getItemInputFingerprint(originalItem),
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
      },
    });

    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return rawStore;
        },
        set() {},
      },
    };

    try {
      clearStorageMemoryCache();
      assert.equal(getStoredState(updatedItem), undefined);
      assert.equal(getDisplayState(updatedItem).abbr, "ACL");
      assert.equal(getStoredState(manualItem)?.abbr, "NAACL");
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("formats CCF column data with stable sort keys and concise tooltips", () => {
    const a = unpackColumnData(
      formatColumnDataForState({
        itemKey: "1:1",
        status: "matched",
        source: "auto",
        rank: "A",
        abbr: "ACL",
        fullName: "Annual Meeting of the Association for Computational Linguistics",
        category: "人工智能",
        confidence: 1,
        matchedField: "identifier:acl-anthology",
        matchMethod: "ACL Anthology DOI/URL 线索 + 精确简称/别名匹配",
        updatedAt: "2026-08-24T12:00:00.000Z",
      }),
    );
    const none = unpackColumnData(
      formatColumnDataForState({
        itemKey: "1:2",
        status: "none",
        source: "auto",
        venueText: "Journal of Extremely Local Experiments",
        confidence: 0.5,
        matchedField: "publicationTitle",
        matchMethod: "有明确 venue，但未命中 CCF 目录",
        updatedAt: "2026-08-24T12:00:00.000Z",
      }),
    );
    const unknown = unpackColumnData(
      formatColumnDataForState({
        itemKey: "1:3",
        status: "unknown",
        source: "auto",
        confidence: 0,
        updatedAt: "2026-08-24T12:00:00.000Z",
      }),
    );

    assert.equal(a.display, "CCF A | ACL");
    assert.match(a.title, /2026 国际目录/);
    assert.match(a.title, /identifier:acl-anthology/);
    assert.equal(none.display, "CCF None | Journal of Extremely Local Experiments");
    assert.equal(unknown.display, "Unknown");
    assert.equal(a.sortKey < none.sortKey, true);
    assert.equal(none.sortKey < unknown.sortKey, true);
  });

  it("keeps CCF column reads cheap and uses the cache after refresh", async () => {
    let registeredColumn: any;
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return "";
        },
        set() {},
      },
      ItemTreeManager: {
        async registerColumns(column: any) {
          registeredColumn = column;
        },
      },
    };

    try {
      clearStorageMemoryCache();
      await registerCCFColumn();
      const item = {
        ...makeItem(
          {
            proceedingsTitle:
              "Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing",
            conferenceName: "EMNLP 2025",
            DOI: "10.18653/v1/2025.emnlp-main.1171",
            url: "https://aclanthology.org/2025.emnlp-main.1171/",
          },
          "conferencePaper",
          401,
        ),
        isAttachment() {
          return false;
        },
        isNote() {
          return false;
        },
      } as unknown as Zotero.Item;

      const data = unpackColumnData(registeredColumn.dataProvider(item));
      assert.equal(getColumnDisplayState(item).status, "unknown");
      assert.equal(data.display, "Unknown");
      assert.match(data.title, /未在列排序路径即时计算/);

      await refreshItemsRank([item]);
      const refreshed = unpackColumnData(registeredColumn.dataProvider(item));
      assert.equal(refreshed.display, "CCF B | EMNLP");
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("cancels batch refresh after saving completed entries", async () => {
    let cancelled = false;
    let rawStore = "";
    let setCalls = 0;
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return rawStore;
        },
        set(_key: string, value: string) {
          setCalls += 1;
          rawStore = value;
        },
      },
    };

    try {
      clearStorageMemoryCache();
      const result = await refreshItemsRank(
        [
          makeItem({ proceedingsTitle: "ACL" }, "conferencePaper", 201),
          makeItem({ proceedingsTitle: "EMNLP" }, "conferencePaper", 202),
          makeItem({ proceedingsTitle: "COLING" }, "conferencePaper", 203),
        ],
        {
          saveBatchSize: 1,
          shouldCancel: () => cancelled,
          onProgress() {
            cancelled = true;
          },
        },
      );

      assert.equal(result.cancelled, true);
      assert.equal(result.processed, 1);
      assert.equal(result.entries[0]?.result.abbr, "ACL");
      assert.equal(setCalls, 1);

      clearStorageMemoryCache();
      assert.equal(
        getStoredState(makeItem({ proceedingsTitle: "ACL" }, "conferencePaper", 201))?.abbr,
        "ACL",
      );
      assert.equal(
        getStoredState(makeItem({ proceedingsTitle: "EMNLP" }, "conferencePaper", 202)),
        undefined,
      );
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("filters cached CCF None and uncached Unknown items without computing matches", async () => {
    let cancelled = false;
    let progressCalls = 0;
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Prefs: {
        get() {
          return "";
        },
        set() {
          throw new Error("filtering should not save prefs");
        },
      },
    };

    try {
      clearStorageMemoryCache();
      const result = await filterItemsByDisplayStatus(
        [
          makeItem({ proceedingsTitle: "ACL" }, "conferencePaper", 301),
          makeItem(
            { publicationTitle: "Journal of Extremely Local Experiments" },
            "journalArticle",
            302,
          ),
          makeItem({}, "conferencePaper", 303),
          makeItem({ proceedingsTitle: "EMNLP" }, "conferencePaper", 304),
        ],
        ["unknown", "none"],
        {
          shouldCancel: () => cancelled,
          onProgress(done) {
            progressCalls += 1;
            if (done === 3) cancelled = true;
          },
        },
      );

      assert.equal(result.cancelled, true);
      assert.equal(result.processed, 3);
      assert.deepEqual(
        result.items.map((item) => item.id),
        [301, 302, 303],
      );
      assert.equal(progressCalls, 3);
    } finally {
      clearStorageMemoryCache();
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("renders diagnostics without writing Zotero metadata", () => {
    const output = formatItemDiagnostics(
      makeItem({
        DOI: "10.18653/v1/2026.acl-long.293",
        title:
          "What's Left Unsaid? Detecting and Correcting Misleading Omissions in Multimodal News Previews",
      }),
    );

    assert.match(output, /CCF 识别诊断/);
    assert.match(output, /identifier:acl-anthology/);
    assert.match(output, /结果：CCF A \| ACL/);
    assert.match(output, /命中字段：identifier:acl-anthology/);
    assert.match(output, /匹配规则：ACL Anthology DOI\/URL 线索/);
    assert.match(output, /候选 venue/);
  });

  it("renders diagnostics for CCF high-quality Chinese journal matches", () => {
    const output = formatItemDiagnostics(
      makeItem({ publicationTitle: "电子学报" }, "journalArticle"),
    );

    assert.match(output, /结果：CCF T1 \| 电子学报/);
    assert.match(output, /命中字段：publicationTitle/);
    assert.match(output, /匹配规则：publicationTitle 字段/);
    assert.match(output, /2025 计算领域高质量科技期刊目录/);
  });
});
