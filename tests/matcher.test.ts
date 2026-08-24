import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
import { getDisplayState, refreshItemsRank } from "../src/modules/rankService";
import { clearStorageMemoryCache, getStoredState } from "../src/modules/storage";
import { resolveVenueCandidates } from "../src/modules/venueResolver";

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
    assert.equal(getVenueCount(), 682);
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
        getStoredState({ libraryID: 1, id: 201 } as Zotero.Item)?.abbr,
        "ACL",
      );
      assert.equal(
        getStoredState({ libraryID: 1, id: 202 } as Zotero.Item),
        undefined,
      );
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
    assert.match(output, /候选 venue/);
  });
});
