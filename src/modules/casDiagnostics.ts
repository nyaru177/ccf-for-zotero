import { getCASCatalogStatusText } from "./casCatalog";
import { resolveCASItem } from "./casService";
import { CASMatchResult, JournalIdentityCandidate } from "./casTypes";
import { resolveJournalIdentityCandidates } from "./journalIdentity";

const inspectedFields = [
  "title",
  "publicationTitle",
  "journalAbbreviation",
  "ISSN",
  "DOI",
  "url",
  "extra",
];

export interface CASItemDiagnostics {
  itemType: string;
  fields: Array<{ field: string; value: string }>;
  candidates: JournalIdentityCandidate[];
  result: CASMatchResult;
}

function getField(item: Zotero.Item, field: string): string {
  try {
    const value = item.getField(field);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function formatConfidence(result: CASMatchResult): string {
  if (typeof result.confidence !== "number") return "n/a";
  return `${Math.round(result.confidence * 100)}%`;
}

function formatPlacementList(
  label: string,
  placements: CASMatchResult["majorPlacements"],
): string[] {
  if (!placements?.length) return [];
  return [
    `${label}：${placements
      .map((placement) => `${placement.category} ${placement.zone}区`)
      .join("；")}`,
  ];
}

function formatEvidence(result: CASMatchResult): string[] {
  const lines: string[] = [];
  if (result.matchedField) lines.push(`命中字段：${result.matchedField}`);
  if (result.matchedValue) lines.push(`命中线索：${result.matchedValue}`);
  if (result.matchMethod) lines.push(`匹配规则：${result.matchMethod}`);
  return lines;
}

function formatResult(result: CASMatchResult): string {
  if (result.status === "matched") {
    return [
      `结果：CAS ${result.majorPlacements?.[0]?.zone || result.minorPlacements?.[0]?.zone || "?"}区 | ${result.abbreviation || result.journalTitle || "Journal"}`,
      `刊名：${result.journalTitle || "n/a"}`,
      ...formatPlacementList("大类", result.majorPlacements),
      ...formatPlacementList("小类", result.minorPlacements),
      result.isTop ? "Top：是" : "",
      result.isWarned ? "预警：是" : "",
      ...formatEvidence(result),
      `置信度：${formatConfidence(result)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.status === "not-listed") {
    return [
      `结果：CAS None | ${result.venueText || "Journal"}`,
      ...formatEvidence(result),
      `置信度：${formatConfidence(result)}`,
    ].join("\n");
  }

  if (result.status === "not-applicable") {
    return ["结果：N/A", ...formatEvidence(result)].join("\n");
  }

  if (result.status === "data-missing") {
    return [
      "结果：CAS 数据未内置",
      `数据状态：${getCASCatalogStatusText()}`,
      ...formatEvidence(result),
    ].join("\n");
  }

  return [
    "结果：Unknown",
    ...formatEvidence(result),
    `置信度：${formatConfidence(result)}`,
  ].join("\n");
}

function explainResult(result: CASMatchResult): string {
  if (result.status === "data-missing") {
    return "原因：当前公开源码没有内置可再分发的 CAS 全量快照；等确认官方/授权数据后再打包。";
  }
  if (result.status === "not-applicable") {
    return "原因：CAS 是期刊分区，会议、书籍、预印本等非期刊条目不适用。";
  }
  if (result.status === "unknown") {
    return "原因：没有足够的期刊身份线索。CAS 优先使用 ISSN，其次使用刊名全称/简称。";
  }
  if (result.status === "not-listed") {
    return "原因：已识别为期刊，但未命中当前内置 CAS 快照。";
  }
  return "原因：条目期刊身份命中当前内置 CAS 快照。";
}

export function getCASItemDiagnostics(item: Zotero.Item): CASItemDiagnostics {
  return {
    itemType: item.itemType,
    fields: inspectedFields
      .map((field) => ({ field, value: getField(item, field) }))
      .filter((entry) => entry.value),
    candidates: resolveJournalIdentityCandidates(item),
    result: resolveCASItem(item),
  };
}

export function formatCASItemDiagnostics(item: Zotero.Item): string {
  const diagnostics = getCASItemDiagnostics(item);
  const lines = [
    "CAS 中科院分区识别诊断",
    "",
    `Item type：${diagnostics.itemType || "n/a"}`,
    "",
    "读取字段：",
  ];

  if (diagnostics.fields.length) {
    for (const entry of diagnostics.fields) {
      lines.push(`- ${entry.field}: ${entry.value}`);
    }
  } else {
    lines.push("- 未读取到关键字段");
  }

  lines.push("", "候选期刊身份：");
  if (diagnostics.candidates.length) {
    diagnostics.candidates.forEach((candidate, index) => {
      lines.push(`${index + 1}. [${candidate.field}, ${candidate.kind}] ${candidate.value}`);
    });
  } else {
    lines.push("- 无候选期刊身份");
  }

  lines.push("", "最终判定：", formatResult(diagnostics.result));
  lines.push("", explainResult(diagnostics.result));

  return lines.join("\n");
}
