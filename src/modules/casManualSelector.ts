import {
  ensureCASCatalog,
  getCASCatalog,
  getCASCatalogVersion,
} from "./casCatalog";
import { CASCatalog, CASJournal, CASMatchResult, CASZone } from "./casTypes";
import { normalizeISSN, normalizeJournalTitle } from "./journalIdentity";

export interface CASJournalSearchFilters {
  zone?: "" | CASZone;
  majorCategory?: string;
  minorCategory?: string;
  flag?: "" | "top" | "warned";
}

export interface CASJournalSearchOption {
  journal: CASJournal;
  score: number;
}

type ZoneFilterText = "" | "1" | "2" | "3" | "4";

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+\-/\s\u4e00-\u9fff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function formatISSN(value: string): string {
  const normalized = normalizeISSN(value);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : value;
}

function getJournalISSNs(journal: CASJournal): string[] {
  return [
    ...new Set(
      [...(journal.issn || []), ...(journal.eissn || [])]
        .map((value) => normalizeISSN(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function journalTextPool(journal: CASJournal): string[] {
  const major = journal.majorPlacements || [];
  const minor = journal.minorPlacements || [];
  return [
    journal.title,
    journal.titleZh || "",
    journal.abbreviation || "",
    ...(journal.aliases || []),
    ...getJournalISSNs(journal),
    ...getJournalISSNs(journal).map(formatISSN),
    ...major.map((placement) => placement.category),
    ...minor.map((placement) => placement.category),
    ...major.map((placement) => `${placement.category} ${placement.zone}区`),
    ...minor.map((placement) => `${placement.category} ${placement.zone}区`),
    journal.isTop ? "top 顶级 top期刊" : "",
    journal.isWarned ? "warned 预警 预警期刊" : "",
  ].filter(Boolean);
}

function isOrderedSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function tokenMatchesText(token: string, text: string): boolean {
  if (text.includes(token)) return true;
  return token.length >= 3 && isOrderedSubsequence(token, text);
}

function journalSearchScore(journal: CASJournal, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitleQuery = normalizeJournalTitle(query);
  const normalizedISSNQuery = normalizeISSN(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const compactQuery = compactText(query);

  if (!normalizedQuery && !normalizedISSNQuery) {
    const zones = [
      ...(journal.majorPlacements || []).map((placement) => placement.zone),
      ...(journal.minorPlacements || []).map((placement) => placement.zone),
    ];
    const bestZone = zones.length ? Math.min(...zones) : 4;
    return 300 - bestZone * 20 + (journal.isTop ? 15 : 0);
  }

  let score = 0;

  if (normalizedISSNQuery && getJournalISSNs(journal).includes(normalizedISSNQuery)) {
    score += 1400;
  }

  const normalizedTitle = normalizeJournalTitle(journal.title);
  const normalizedZhTitle = journal.titleZh
    ? normalizeJournalTitle(journal.titleZh)
    : "";
  const normalizedAbbr = journal.abbreviation
    ? normalizeJournalTitle(journal.abbreviation)
    : "";

  if (normalizedTitleQuery && normalizedTitle === normalizedTitleQuery) {
    score += 1200;
  }
  if (normalizedTitleQuery && normalizedZhTitle === normalizedTitleQuery) {
    score += 1150;
  }
  if (normalizedTitleQuery && normalizedAbbr === normalizedTitleQuery) {
    score += 1100;
  }

  for (const raw of journalTextPool(journal)) {
    const text = normalizeSearchText(raw);
    const compact = text.replace(/\s+/g, "");
    if (!text) continue;

    if (normalizedQuery && text === normalizedQuery) score += 900;
    if (normalizedQuery && text.startsWith(normalizedQuery)) score += 700;
    if (normalizedQuery && text.includes(normalizedQuery)) score += 520;
    if (compactQuery.length >= 3 && compact.includes(compactQuery)) score += 460;

    if (
      queryTokens.length > 1 &&
      queryTokens.every((token) => tokenMatchesText(token, compact))
    ) {
      score += 420;
    } else if (
      queryTokens.length === 1 &&
      tokenMatchesText(queryTokens[0], compact)
    ) {
      score += 130;
    }
  }

  const bestMajorZone = journal.majorPlacements?.[0]?.zone || 4;
  score += 40 - bestMajorZone * 10 + (journal.isTop ? 12 : 0);
  return score;
}

function matchesFilters(
  journal: CASJournal,
  filters: CASJournalSearchFilters,
): boolean {
  if (filters.zone) {
    const allPlacements = [
      ...(journal.majorPlacements || []),
      ...(journal.minorPlacements || []),
    ];
    if (!allPlacements.some((placement) => placement.zone === filters.zone)) {
      return false;
    }
  }
  if (
    filters.majorCategory &&
    !journal.majorPlacements?.some(
      (placement) => placement.category === filters.majorCategory,
    )
  ) {
    return false;
  }
  if (
    filters.minorCategory &&
    !journal.minorPlacements?.some(
      (placement) => placement.category === filters.minorCategory,
    )
  ) {
    return false;
  }
  if (filters.flag === "top" && !journal.isTop) return false;
  if (filters.flag === "warned" && !journal.isWarned) return false;
  return true;
}

function compareCASJournals(a: CASJournal, b: CASJournal): number {
  const aZone = a.majorPlacements?.[0]?.zone || a.minorPlacements?.[0]?.zone || 4;
  const bZone = b.majorPlacements?.[0]?.zone || b.minorPlacements?.[0]?.zone || 4;
  return (
    aZone - bZone ||
    (a.abbreviation || a.title).localeCompare(b.abbreviation || b.title)
  );
}

export function getCASMajorCategories(catalog: CASCatalog = getCASCatalog()): string[] {
  return [
    ...new Set(
      catalog.journals.flatMap((journal) =>
        (journal.majorPlacements || []).map((placement) => placement.category),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function getCASMinorCategories(catalog: CASCatalog = getCASCatalog()): string[] {
  return [
    ...new Set(
      catalog.journals.flatMap((journal) =>
        (journal.minorPlacements || []).map((placement) => placement.category),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function searchCASJournalOptions(
  query: string,
  filters: CASJournalSearchFilters = {},
  limit = 40,
  catalog: CASCatalog = getCASCatalog(),
): CASJournalSearchOption[] {
  const trimmedQuery = query.trim();
  return catalog.journals
    .filter((journal) => matchesFilters(journal, filters))
    .map((journal) => ({
      journal,
      score: journalSearchScore(journal, trimmedQuery),
    }))
    .filter((option) => !trimmedQuery || option.score > 30)
    .sort((a, b) => b.score - a.score || compareCASJournals(a.journal, b.journal))
    .slice(0, limit);
}

export function casJournalToManualResult(
  journal: CASJournal,
): CASMatchResult {
  return {
    status: "matched",
    source: "manual",
    journalKey: journal.key,
    journalTitle: journal.title,
    abbreviation: journal.abbreviation,
    issn: getJournalISSNs(journal),
    majorPlacements: journal.majorPlacements,
    minorPlacements: journal.minorPlacements,
    isTop: journal.isTop,
    isWarned: journal.isWarned,
    venueText: journal.abbreviation || journal.title,
    matchedField: "manual",
    matchedValue: journal.abbreviation || journal.title,
    matchMethod: "用户手动选择 CAS 期刊",
    confidence: 1,
    catalogVersion: getCASCatalogVersion(),
  };
}

function primaryCASLabel(journal: CASJournal): string {
  const placement = journal.majorPlacements?.[0] || journal.minorPlacements?.[0];
  return placement ? `CAS ${placement.zone}区` : "CAS";
}

function journalKey(journal: CASJournal): string {
  return `${journal.key}::${journal.title}`;
}

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function createHtmlElement<T extends HTMLElement>(
  doc: Document,
  tagName: string,
): T {
  return doc.createElementNS(XHTML_NS, tagName) as T;
}

function buildCASSelectorHtml() {
  return `
    <style>
      .cas-selector {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 9px;
        width: 100%;
        height: 540px;
        min-width: 0;
        min-height: 0;
        padding: 12px;
        color: #1f2933;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.35;
        overflow: hidden;
      }
      .cas-selector input {
        box-sizing: border-box;
        width: 100%;
        height: 34px;
        border: 1px solid #cfd6df;
        border-radius: 6px;
        padding: 5px 9px;
        color: #1f2933;
        background: #fff;
        font-family: inherit;
        font-size: 14px;
        line-height: 20px;
      }
      .cas-filter-row {
        display: grid;
        grid-template-columns: 110px minmax(150px, 1fr) minmax(170px, 1.2fr) 110px;
        gap: 8px;
        position: relative;
        z-index: 30;
        flex: 0 0 auto;
      }
      .cas-filter {
        position: relative;
        min-width: 0;
      }
      .cas-filter-trigger {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        height: 34px;
        border: 1px solid #cfd6df;
        border-radius: 6px;
        padding: 0 10px;
        background: #f5f7fa;
        color: #111827;
        cursor: pointer;
        user-select: none;
      }
      .cas-filter-trigger:focus {
        outline: 2px solid #79a8e8;
        outline-offset: 1px;
      }
      .cas-filter-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cas-filter-arrow {
        color: #52616b;
        flex: 0 0 auto;
      }
      .cas-filter-menu {
        box-sizing: border-box;
        display: none;
        position: absolute;
        top: 38px;
        left: 0;
        min-width: 100%;
        max-width: min(620px, 90vw);
        max-height: 260px;
        overflow: auto;
        z-index: 100;
        border: 1px solid #ccd6e0;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.16);
      }
      .cas-filter.open .cas-filter-menu {
        display: block;
      }
      .cas-filter-option {
        box-sizing: border-box;
        padding: 7px 10px;
        min-width: 170px;
        color: #1f2933;
        cursor: pointer;
        white-space: nowrap;
      }
      .cas-filter-option:hover,
      .cas-filter-option.active {
        background: #e8f1ff;
      }
      .cas-search-help,
      .cas-result-meta,
      .cas-dialog-status {
        color: #52616b;
        font-size: 12px;
        flex: 0 0 auto;
      }
      .cas-dialog-status {
        min-height: 18px;
        color: #9b2c2c;
      }
      .cas-result-list {
        border: 1px solid #d8dee6;
        border-radius: 6px;
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: #fff;
      }
      .cas-option {
        box-sizing: border-box;
        display: block;
        width: 100%;
        border-bottom: 1px solid #edf0f4;
        background: #fff;
        color: #1f2933;
        padding: 8px 10px 7px;
        cursor: pointer;
        user-select: none;
      }
      .cas-option:hover {
        background: #f5f8fb;
      }
      .cas-option.selected {
        background: #e8f1ff;
        outline: 2px solid #79a8e8;
        outline-offset: -2px;
      }
      .cas-option-line {
        display: grid;
        grid-template-columns: auto minmax(90px, auto) minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        min-width: 0;
        line-height: 20px;
      }
      .cas-zone-pill {
        border-radius: 999px;
        padding: 1px 7px;
        font-weight: 650;
        line-height: 18px;
        white-space: nowrap;
        background: #e0f2fe;
        color: #075985;
      }
      .cas-journal-abbr {
        font-weight: 700;
        color: #111827;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cas-journal-meta,
      .cas-journal-full {
        color: #52616b;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cas-journal-full {
        display: block;
        margin-top: 3px;
        color: #394b59;
        font-size: 12px;
        line-height: 18px;
      }
    </style>
    <div id="cas-selector-root" class="cas-selector"></div>
  `;
}

export async function openManualCASJournalSelector(
  win: Window,
  initialQuery = "",
): Promise<CASJournal | undefined> {
  await ensureCASCatalog();
  let selectedJournal: CASJournal | undefined;
  let currentOptions: CASJournalSearchOption[] = [];
  const dialogData: any = {};
  const dialog = new ztoolkit.Dialog(1, 1);

  function applySelection() {
    if (!selectedJournal) return false;
    dialogData.selectedJournal = selectedJournal;
    dialogData._lastButtonId = "apply";
    dialog.window.close();
    return true;
  }

  dialogData.loadCallback = () => {
    const catalog = getCASCatalog();
    const doc = dialog.window.document;
    const root = doc.getElementById("cas-selector-root") as HTMLElement | null;
    if (!root) return;

    root.textContent = "";

    let zoneFilter: "" | CASZone = "";
    let majorCategoryFilter = "";
    let minorCategoryFilter = "";
    let flagFilter: "" | "top" | "warned" = "";
    let render = () => {};
    const filterControls: HTMLElement[] = [];

    const closeFilterMenus = (except?: HTMLElement) => {
      for (const control of filterControls) {
        if (control !== except) {
          control.classList.remove("open");
        }
      }
    };

    function createFilterControl<T extends string>(
      label: string,
      options: Array<{ value: T; label: string }>,
      getValue: () => T,
      setValue: (value: T) => void,
    ) {
      const wrapper = createHtmlElement<HTMLDivElement>(doc, "div");
      wrapper.className = "cas-filter";

      const trigger = createHtmlElement<HTMLDivElement>(doc, "div");
      trigger.className = "cas-filter-trigger";
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
      trigger.setAttribute("aria-label", label);

      const labelElement = createHtmlElement<HTMLSpanElement>(doc, "span");
      labelElement.className = "cas-filter-label";
      trigger.appendChild(labelElement);

      const arrow = createHtmlElement<HTMLSpanElement>(doc, "span");
      arrow.className = "cas-filter-arrow";
      arrow.textContent = "▾";
      trigger.appendChild(arrow);

      const menu = createHtmlElement<HTMLDivElement>(doc, "div");
      menu.className = "cas-filter-menu";
      menu.setAttribute("role", "listbox");

      const optionElements: HTMLElement[] = [];
      const updateSelectedOption = () => {
        const currentValue = getValue();
        const currentOption =
          options.find((option) => option.value === currentValue) || options[0];
        labelElement.textContent = currentOption?.label || label;
        for (const optionElement of optionElements) {
          optionElement.classList.toggle(
            "active",
            optionElement.dataset.value === currentValue,
          );
        }
      };

      for (const option of options) {
        const optionElement = createHtmlElement<HTMLDivElement>(doc, "div");
        optionElement.className = "cas-filter-option";
        optionElement.dataset.value = option.value;
        optionElement.textContent = option.label;
        optionElement.setAttribute("role", "option");
        optionElement.setAttribute("tabindex", "0");
        optionElement.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setValue(option.value);
          updateSelectedOption();
          closeFilterMenus();
          render();
        });
        optionElement.addEventListener("keydown", (event) => {
          const keyboardEvent = event as KeyboardEvent;
          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            setValue(option.value);
            updateSelectedOption();
            closeFilterMenus();
            render();
          }
          if (keyboardEvent.key === "Escape") closeFilterMenus();
        });
        optionElements.push(optionElement);
        menu.appendChild(optionElement);
      }

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = !wrapper.classList.contains("open");
        closeFilterMenus(wrapper);
        wrapper.classList.toggle("open", shouldOpen);
      });
      trigger.addEventListener("keydown", (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          const shouldOpen = !wrapper.classList.contains("open");
          closeFilterMenus(wrapper);
          wrapper.classList.toggle("open", shouldOpen);
        }
        if (keyboardEvent.key === "Escape") closeFilterMenus();
      });

      wrapper.appendChild(trigger);
      wrapper.appendChild(menu);
      filterControls.push(wrapper);
      updateSelectedOption();
      return wrapper;
    }

    const queryInput = createHtmlElement<HTMLInputElement>(doc, "input");
    queryInput.type = "search";
    queryInput.value = initialQuery;
    queryInput.placeholder = "搜索 CAS 期刊：输入 ISSN、简称、全称或分类";
    root.appendChild(queryInput);

    const help = createHtmlElement<HTMLDivElement>(doc, "div");
    help.className = "cas-search-help";
    help.textContent =
      "CAS 只适用于期刊；优先使用 ISSN，其次使用期刊简称和全称。";
    root.appendChild(help);

    const filterRow = createHtmlElement<HTMLDivElement>(doc, "div");
    filterRow.className = "cas-filter-row";
    root.appendChild(filterRow);

    filterRow.appendChild(
      createFilterControl<ZoneFilterText>(
        "分区",
        [
          { value: "", label: "全部分区" },
          { value: "1", label: "1区" },
          { value: "2", label: "2区" },
          { value: "3", label: "3区" },
          { value: "4", label: "4区" },
        ],
        () => (zoneFilter ? String(zoneFilter) as ZoneFilterText : ""),
        (value) => {
          zoneFilter = value ? (Number(value) as CASZone) : "";
        },
      ),
    );

    filterRow.appendChild(
      createFilterControl<string>(
        "大类",
        [
          { value: "", label: "全部大类" },
          ...getCASMajorCategories(catalog).map((category) => ({
            value: category,
            label: category,
          })),
        ],
        () => majorCategoryFilter,
        (value) => {
          majorCategoryFilter = value;
        },
      ),
    );

    filterRow.appendChild(
      createFilterControl<string>(
        "小类",
        [
          { value: "", label: "全部小类" },
          ...getCASMinorCategories(catalog).map((category) => ({
            value: category,
            label: category,
          })),
        ],
        () => minorCategoryFilter,
        (value) => {
          minorCategoryFilter = value;
        },
      ),
    );

    filterRow.appendChild(
      createFilterControl<"" | "top" | "warned">(
        "标记",
        [
          { value: "", label: "全部标记" },
          { value: "top", label: "Top" },
          { value: "warned", label: "预警" },
        ],
        () => flagFilter,
        (value) => {
          flagFilter = value;
        },
      ),
    );

    const meta = createHtmlElement<HTMLDivElement>(doc, "div");
    meta.className = "cas-result-meta";
    root.appendChild(meta);

    const list = createHtmlElement<HTMLDivElement>(doc, "div");
    list.className = "cas-result-list";
    root.appendChild(list);

    const status = createHtmlElement<HTMLDivElement>(doc, "div");
    status.className = "cas-dialog-status";
    root.appendChild(status);

    const markSelection = () => {
      const selectedKey = selectedJournal ? journalKey(selectedJournal) : "";
      const rows = Array.from(
        list.getElementsByClassName("cas-option"),
      ) as HTMLElement[];
      for (const row of rows) {
        row.classList.toggle("selected", row.dataset.journalKey === selectedKey);
      }
    };

    render = () => {
      currentOptions = searchCASJournalOptions(
        queryInput.value,
        {
          zone: zoneFilter,
          majorCategory: majorCategoryFilter,
          minorCategory: minorCategoryFilter,
          flag: flagFilter,
        },
        50,
        catalog,
      );

      if (
        !selectedJournal ||
        !currentOptions.some(
          (option) => journalKey(option.journal) === journalKey(selectedJournal!),
        )
      ) {
        selectedJournal = currentOptions[0]?.journal;
      }

      list.textContent = "";
      meta.textContent = currentOptions.length
        ? `显示 ${currentOptions.length} 本候选期刊；单击选择，双击直接应用。`
        : "没有候选，请换一个关键词或放宽筛选条件。";
      status.textContent = "";

      for (const option of currentOptions) {
        const journal = option.journal;
        const row = createHtmlElement<HTMLDivElement>(doc, "div");
        row.className =
          "cas-option" +
          (selectedJournal && journalKey(selectedJournal) === journalKey(journal)
            ? " selected"
            : "");
        row.dataset.journalKey = journalKey(journal);
        row.title = journal.title;
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");

        const line = createHtmlElement<HTMLDivElement>(doc, "div");
        line.className = "cas-option-line";

        const zone = createHtmlElement<HTMLSpanElement>(doc, "span");
        zone.className = "cas-zone-pill";
        zone.textContent = primaryCASLabel(journal);
        line.appendChild(zone);

        const abbr = createHtmlElement<HTMLSpanElement>(doc, "span");
        abbr.className = "cas-journal-abbr";
        abbr.textContent = journal.abbreviation || journal.title;
        line.appendChild(abbr);

        const metaText = createHtmlElement<HTMLSpanElement>(doc, "span");
        metaText.className = "cas-journal-meta";
        metaText.textContent = [
          journal.majorPlacements?.[0]?.category,
          journal.isTop ? "Top" : "",
          journal.isWarned ? "预警" : "",
          getJournalISSNs(journal)[0] ? formatISSN(getJournalISSNs(journal)[0]) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        line.appendChild(metaText);

        const fullName = createHtmlElement<HTMLSpanElement>(doc, "span");
        fullName.className = "cas-journal-full";
        const minorPreview = (journal.minorPlacements || [])
          .slice(0, 2)
          .map((placement) => `${placement.category} ${placement.zone}区`)
          .join("；");
        fullName.textContent = minorPreview
          ? `${journal.title} · 小类：${minorPreview}`
          : journal.title;

        row.appendChild(line);
        row.appendChild(fullName);
        row.addEventListener("click", () => {
          selectedJournal = journal;
          markSelection();
        });
        row.addEventListener("dblclick", () => {
          selectedJournal = journal;
          applySelection();
        });
        row.addEventListener("keydown", (event) => {
          const keyboardEvent = event as KeyboardEvent;
          if (keyboardEvent.key === "Enter" && applySelection()) {
            keyboardEvent.preventDefault();
          }
          if (keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            selectedJournal = journal;
            markSelection();
          }
        });
        list.appendChild(row);
      }
    };

    queryInput.addEventListener("input", render);
    doc.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(".cas-filter")) return;
      closeFilterMenus();
    });
    queryInput.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && applySelection()) {
        keyboardEvent.preventDefault();
      }
    });
    render();
    dialog.window.setTimeout(() => {
      queryInput.focus();
      queryInput.select();
    }, 0);
  };

  dialog
    .setDialogData(dialogData)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      properties: { innerHTML: buildCASSelectorHtml() },
    })
    .addButton("取消", "cancel")
    .addButton("应用到所选条目", "apply", {
      noClose: true,
      callback: () => {
        if (!applySelection()) {
          const status = dialog.window.document.querySelector(
            ".cas-dialog-status",
          );
          if (status) status.textContent = "请先选择一本 CAS 期刊。";
        }
      },
    })
    .open("设置 CAS 期刊分区", {
      centerscreen: true,
      width: 820,
      height: 650,
      resizable: true,
      fitContent: false,
    });

  await dialogData.unloadLock?.promise;
  return dialogData._lastButtonId === "apply"
    ? (dialogData.selectedJournal as CASJournal | undefined)
    : undefined;
}
