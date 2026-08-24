import { getVenues } from "./matcher";
import { CCFKind, CCFRank, CCFVenue, MatchResult } from "./types";

export interface VenueSearchFilters {
  kind?: "" | CCFKind;
  rank?: "" | CCFRank;
  category?: string;
}

export interface VenueSearchOption {
  venue: CCFVenue;
  score: number;
}

const kindLabels: Record<CCFKind, string> = {
  conference: "会议",
  journal: "期刊",
};

const rankOrder: Record<CCFRank, number> = { A: 0, B: 1, C: 2 };

const categorySearchAliases: Record<string, string[]> = {
  "计算机体系结构/并行与分布计算/存储系统": [
    "architecture",
    "parallel computing",
    "distributed computing",
    "storage systems",
  ],
  计算机网络: ["network", "computer network", "networking"],
  网络与信息安全: ["security", "privacy", "information security"],
  "软件工程/系统软件/程序设计语言": [
    "software engineering",
    "systems software",
    "programming languages",
  ],
  "数据库/数据挖掘/内容检索": [
    "database",
    "data mining",
    "information retrieval",
    "retrieval",
  ],
  计算机科学理论: ["theory", "theoretical computer science"],
  计算机图形学与多媒体: ["graphics", "multimedia"],
  人工智能: ["ai", "artificial intelligence", "machine learning"],
  人机交互与普适计算: [
    "human computer interaction",
    "hci",
    "ubiquitous computing",
  ],
  "交叉/综合/新兴": ["interdisciplinary", "emerging", "general"],
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+\-/\s\u4e00-\u9fff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAbbr(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9+\-/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
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

function venueKey(venue: CCFVenue): string {
  return `${venue.kind}::${venue.abbr}::${venue.fullName}`;
}

function venueTextPool(venue: CCFVenue): string[] {
  return [
    venue.abbr,
    venue.fullName,
    venue.category,
    kindLabels[venue.kind],
    venue.kind,
    venue.rank,
    `CCF ${venue.rank}`,
    ...(categorySearchAliases[venue.category] || []),
    ...(venue.aliases || []),
  ];
}

function optionScore(venue: CCFVenue, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const queryAbbr = normalizeAbbr(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const compactNormalizedQuery = compactSearchText(query);

  if (!normalizedQuery && !queryAbbr) {
    return 300 - rankOrder[venue.rank] * 20 + (venue.kind === "conference" ? 4 : 0);
  }

  let score = 0;
  const normalizedAbbr = normalizeAbbr(venue.abbr);
  const compactAbbr = normalizedAbbr.replace(/\s+/g, "");
  const compactQuery = queryAbbr.replace(/\s+/g, "");

  if (queryAbbr && normalizedAbbr === queryAbbr) score += 1200;
  if (compactQuery && compactAbbr === compactQuery) score += 1100;
  if (queryAbbr && normalizedAbbr.startsWith(queryAbbr)) score += 850;
  if (
    compactNormalizedQuery.length >= 3 &&
    compactAbbr.includes(compactNormalizedQuery.toUpperCase())
  ) {
    score += 780;
  }

  for (const raw of venueTextPool(venue)) {
    const text = normalizeSearchText(raw);
    const abbrText = normalizeAbbr(raw);
    const compactText = text.replace(/\s+/g, "");
    if (!text && !abbrText) continue;

    if (normalizedQuery && text === normalizedQuery) score += 1000;
    if (queryAbbr && abbrText === queryAbbr) score += 950;
    if (normalizedQuery && text.startsWith(normalizedQuery)) score += 700;
    if (normalizedQuery && text.includes(normalizedQuery)) score += 520;
    if (
      compactNormalizedQuery.length >= 3 &&
      compactText.includes(compactNormalizedQuery)
    ) {
      score += 480;
    }

    if (
      queryTokens.length > 1 &&
      queryTokens.every((token) => tokenMatchesText(token, compactText))
    ) {
      score += 460;
    } else if (
      queryTokens.length === 1 &&
      tokenMatchesText(queryTokens[0], compactText)
    ) {
      score += 160;
    }
  }

  if (venue.category.includes(query.trim())) score += 360;
  score += 30 - rankOrder[venue.rank] * 10;
  return score;
}

function compareVenues(a: CCFVenue, b: CCFVenue): number {
  return (
    a.kind.localeCompare(b.kind) ||
    a.category.localeCompare(b.category, "zh-CN") ||
    rankOrder[a.rank] - rankOrder[b.rank] ||
    a.abbr.localeCompare(b.abbr)
  );
}

export function getCCFCategories(): string[] {
  return [...new Set(getVenues().map((venue) => venue.category))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

export function getVenueKindLabel(kind: CCFKind): string {
  return kindLabels[kind];
}

export function searchVenueOptions(
  query: string,
  filters: VenueSearchFilters = {},
  limit = 30,
): VenueSearchOption[] {
  const trimmedQuery = query.trim();
  return getVenues()
    .filter((venue) => !filters.kind || venue.kind === filters.kind)
    .filter((venue) => !filters.rank || venue.rank === filters.rank)
    .filter((venue) => !filters.category || venue.category === filters.category)
    .map((venue) => ({ venue, score: optionScore(venue, trimmedQuery) }))
    .filter((option) => !trimmedQuery || option.score > 30)
    .sort((a, b) => b.score - a.score || compareVenues(a.venue, b.venue))
    .slice(0, limit);
}

export function venueToManualResult(venue: CCFVenue): MatchResult {
  return {
    status: "matched",
    source: "manual",
    rank: venue.rank,
    abbr: venue.abbr,
    fullName: venue.fullName,
    category: venue.category,
    venueText: venue.abbr,
    confidence: 1,
  };
}

export function groupVenuesForBrowse() {
  const groups = new Map<CCFKind, Map<string, Map<CCFRank, CCFVenue[]>>>();
  for (const venue of getVenues()) {
    const categoryMap = groups.get(venue.kind) || new Map();
    const rankMap = categoryMap.get(venue.category) || new Map();
    const venues = rankMap.get(venue.rank) || [];
    venues.push(venue);
    rankMap.set(venue.rank, venues);
    categoryMap.set(venue.category, rankMap);
    groups.set(venue.kind, categoryMap);
  }

  for (const categoryMap of groups.values()) {
    for (const rankMap of categoryMap.values()) {
      for (const venues of rankMap.values()) {
        venues.sort((a, b) => a.abbr.localeCompare(b.abbr));
      }
    }
  }

  return groups;
}

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function createHtmlElement<T extends HTMLElement>(
  doc: Document,
  tagName: string,
): T {
  return doc.createElementNS(XHTML_NS, tagName) as T;
}

function addSelectOption(
  doc: Document,
  select: HTMLSelectElement,
  value: string,
  label: string,
) {
  const option = createHtmlElement<HTMLOptionElement>(doc, "option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function buildSelectorHtml() {
  return `
    <style>
      .ccf-selector {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 680px;
        min-height: 500px;
        padding: 14px;
        font: menu;
      }
      .ccf-selector input,
      .ccf-selector select {
        box-sizing: border-box;
        min-height: 30px;
        border: 1px solid #cfd6df;
        border-radius: 6px;
        padding: 4px 8px;
        font: menu;
      }
      .ccf-selector input {
        width: 100%;
        font-size: 14px;
      }
      .ccf-filter-row {
        display: grid;
        grid-template-columns: 120px 120px 1fr;
        gap: 8px;
      }
      .ccf-result-meta {
        color: #52616b;
        font-size: 12px;
      }
      .ccf-search-help {
        color: #52616b;
        font-size: 12px;
      }
      .ccf-result-list {
        border: 1px solid #d8dee6;
        border-radius: 6px;
        flex: 1;
        min-height: 320px;
        overflow: auto;
        background: #fff;
      }
      .ccf-option {
        box-sizing: border-box;
        display: block;
        width: 100%;
        border: 0;
        border-bottom: 1px solid #edf0f4;
        background: #fff;
        color: #1f2933;
        padding: 8px 10px;
        text-align: left;
        font: menu;
        cursor: pointer;
      }
      .ccf-option:hover {
        background: #f5f8fb;
      }
      .ccf-option.selected {
        background: #e8f1ff;
        outline: 2px solid #79a8e8;
        outline-offset: -2px;
      }
      .ccf-option-line {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .ccf-rank-pill {
        border-radius: 999px;
        padding: 1px 7px;
        font-weight: 650;
      }
      .ccf-rank-a {
        background: #dff3e8;
        color: #146c43;
      }
      .ccf-rank-b {
        background: #e8eefc;
        color: #2f56a6;
      }
      .ccf-rank-c {
        background: #fff2cc;
        color: #8a5a00;
      }
      .ccf-venue-abbr {
        font-weight: 700;
      }
      .ccf-venue-meta {
        color: #52616b;
      }
      .ccf-venue-full {
        display: block;
        margin-top: 4px;
        color: #394b59;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ccf-dialog-status {
        min-height: 18px;
        color: #9b2c2c;
        font-size: 12px;
      }
    </style>
    <div id="ccf-selector-root" class="ccf-selector"></div>
  `;
}

export async function openManualVenueSelector(
  win: Window,
  initialQuery = "",
): Promise<CCFVenue | undefined> {
  let selectedVenue: CCFVenue | undefined;
  let currentOptions: VenueSearchOption[] = [];
  const dialogData: any = {};
  const dialog = new ztoolkit.Dialog(1, 1);

  function applySelection() {
    if (!selectedVenue) return false;
    dialogData.selectedVenue = selectedVenue;
    dialogData._lastButtonId = "apply";
    dialog.window.close();
    return true;
  }

  dialogData.loadCallback = () => {
    const doc = dialog.window.document;
    const root = doc.getElementById("ccf-selector-root") as HTMLElement | null;
    if (!root) {
      return;
    }

    root.textContent = "";

    const queryInput = createHtmlElement<HTMLInputElement>(doc, "input");
    queryInput.id = "ccf-selector-query";
    queryInput.type = "search";
    queryInput.value = initialQuery;
    queryInput.placeholder =
      "搜索 CCF 目录：输入简称、全称、分类或英文领域词，例如 ACL、ACM MM、theory";
    root.appendChild(queryInput);

    const help = createHtmlElement<HTMLDivElement>(doc, "div");
    help.className = "ccf-search-help";
    help.textContent = "支持简称、全称、分类和英文领域词；下方分类筛选作为备用。";
    root.appendChild(help);

    const filterRow = createHtmlElement<HTMLDivElement>(doc, "div");
    filterRow.className = "ccf-filter-row";
    root.appendChild(filterRow);

    const kindSelect = createHtmlElement<HTMLSelectElement>(doc, "select");
    kindSelect.id = "ccf-selector-kind";
    addSelectOption(doc, kindSelect, "", "全部类型");
    addSelectOption(doc, kindSelect, "conference", "会议");
    addSelectOption(doc, kindSelect, "journal", "期刊");
    filterRow.appendChild(kindSelect);

    const rankSelect = createHtmlElement<HTMLSelectElement>(doc, "select");
    rankSelect.id = "ccf-selector-rank";
    addSelectOption(doc, rankSelect, "", "全部等级");
    addSelectOption(doc, rankSelect, "A", "CCF A");
    addSelectOption(doc, rankSelect, "B", "CCF B");
    addSelectOption(doc, rankSelect, "C", "CCF C");
    filterRow.appendChild(rankSelect);

    const categorySelect = createHtmlElement<HTMLSelectElement>(doc, "select");
    categorySelect.id = "ccf-selector-category";
    addSelectOption(doc, categorySelect, "", "全部分类");
    for (const category of getCCFCategories()) {
      addSelectOption(doc, categorySelect, category, category);
    }
    filterRow.appendChild(categorySelect);

    const meta = createHtmlElement<HTMLDivElement>(doc, "div");
    meta.id = "ccf-selector-meta";
    meta.className = "ccf-result-meta";
    root.appendChild(meta);

    const list = createHtmlElement<HTMLDivElement>(doc, "div");
    list.id = "ccf-selector-list";
    list.className = "ccf-result-list";
    root.appendChild(list);

    const status = createHtmlElement<HTMLDivElement>(doc, "div");
    status.id = "ccf-selector-status";
    status.className = "ccf-dialog-status";
    root.appendChild(status);

    const render = () => {
      const filters: VenueSearchFilters = {
        kind: kindSelect.value as "" | CCFKind,
        rank: rankSelect.value as "" | CCFRank,
        category: categorySelect.value,
      };
      currentOptions = searchVenueOptions(queryInput.value, filters, 40);
      if (
        !selectedVenue ||
        !currentOptions.some((option) => venueKey(option.venue) === venueKey(selectedVenue!))
      ) {
        selectedVenue = currentOptions[0]?.venue;
      }

      list.textContent = "";
      if (meta) {
        meta.textContent = currentOptions.length
          ? `显示 ${currentOptions.length} 个候选；单击选择，双击直接应用。`
          : "没有候选，请换一个关键词或放宽筛选条件。";
      }
      if (status) status.textContent = "";

      for (const option of currentOptions) {
        const venue = option.venue;
        const button = createHtmlElement<HTMLButtonElement>(doc, "button");
        button.type = "button";
        button.className =
          "ccf-option" +
          (selectedVenue && venueKey(selectedVenue) === venueKey(venue)
            ? " selected"
            : "");
        button.title = venue.fullName;

        const line = createHtmlElement<HTMLDivElement>(doc, "div");
        line.className = "ccf-option-line";

        const rank = createHtmlElement<HTMLSpanElement>(doc, "span");
        rank.className = `ccf-rank-pill ccf-rank-${venue.rank.toLowerCase()}`;
        rank.textContent = `CCF ${venue.rank}`;
        line.appendChild(rank);

        const type = createHtmlElement<HTMLSpanElement>(doc, "span");
        type.className = "ccf-venue-meta";
        type.textContent = kindLabels[venue.kind];
        line.appendChild(type);

        const category = createHtmlElement<HTMLSpanElement>(doc, "span");
        category.className = "ccf-venue-meta";
        category.textContent = venue.category;
        line.appendChild(category);

        const abbr = createHtmlElement<HTMLSpanElement>(doc, "span");
        abbr.className = "ccf-venue-abbr";
        abbr.textContent = venue.abbr;
        line.appendChild(abbr);

        const fullName = createHtmlElement<HTMLSpanElement>(doc, "span");
        fullName.className = "ccf-venue-full";
        fullName.textContent = venue.fullName;
        const aliasPreview = (venue.aliases || [])
          .filter((alias) => alias !== venue.abbr && alias !== venue.fullName)
          .slice(0, 2)
          .join(" / ");
        if (aliasPreview) {
          fullName.textContent = `${venue.fullName} · 别名：${aliasPreview}`;
        }

        button.appendChild(line);
        button.appendChild(fullName);
        button.addEventListener("click", () => {
          selectedVenue = venue;
          render();
        });
        button.addEventListener("dblclick", () => {
          selectedVenue = venue;
          applySelection();
        });
        list.appendChild(button);
      }
    };

    queryInput.addEventListener("input", render);
    kindSelect.addEventListener("change", render);
    rankSelect.addEventListener("change", render);
    categorySelect.addEventListener("change", render);
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
      properties: { innerHTML: buildSelectorHtml() },
    })
    .addButton("取消", "cancel")
    .addButton("应用到所选条目", "apply", {
      noClose: true,
      callback: () => {
        if (!applySelection()) {
          const status = dialog.window.document.getElementById(
            "ccf-selector-status",
          );
          if (status) status.textContent = "请先选择一个 CCF 会议或期刊。";
        }
      },
    })
    .open("设置 CCF 来源", {
      centerscreen: true,
      width: 740,
      height: 620,
      resizable: true,
      fitContent: false,
    });

  await dialogData.unloadLock?.promise;
  return dialogData._lastButtonId === "apply"
    ? (dialogData.selectedVenue as CCFVenue | undefined)
    : undefined;
}
