import { matchCandidates } from "./matcher";
import { formatNonCcfVenueText } from "./nonCcfAliases";
import { MatchResult, VenueCandidate } from "./types";
import { resolveVenueCandidates } from "./venueResolver";

const inspectedFields = [
  "title",
  "publicationTitle",
  "proceedingsTitle",
  "conferenceName",
  "journalAbbreviation",
  "seriesTitle",
  "DOI",
  "url",
  "extra",
];

export interface ItemDiagnostics {
  itemType: string;
  fields: Array<{ field: string; value: string }>;
  candidates: VenueCandidate[];
  isPreprint: boolean;
  result: MatchResult;
}

function getField(item: Zotero.Item, field: string): string {
  try {
    const value = item.getField(field);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function formatConfidence(result: MatchResult): string {
  if (typeof result.confidence !== "number") return "n/a";
  return `${Math.round(result.confidence * 100)}%`;
}

function formatResult(result: MatchResult): string {
  if (result.status === "matched") {
    return [
      `结果：CCF ${result.rank} | ${result.abbr}`,
      `全称：${result.fullName || "n/a"}`,
      `分类：${result.category || "n/a"}`,
      `来源文本：${result.venueText || "n/a"}`,
      `置信度：${formatConfidence(result)}`,
    ].join("\n");
  }

  if (result.status === "none") {
    const venueText = result.venueText || "n/a";
    return [
      `结果：CCF None | ${formatNonCcfVenueText(venueText)}`,
      `来源文本：${venueText}`,
      `置信度：${formatConfidence(result)}`,
    ].join("\n");
  }

  if (result.status === "preprint") {
    return [
      "结果：Preprint | arXiv",
      `来源文本：${result.venueText || "arXiv"}`,
      `置信度：${formatConfidence(result)}`,
    ].join("\n");
  }

  return ["结果：Unknown", `置信度：${formatConfidence(result)}`].join("\n");
}

function explainResult(diagnostics: ItemDiagnostics): string {
  if (diagnostics.result.status === "unknown") {
    if (diagnostics.candidates.length === 0) {
      return "原因：没有读取到可用的 publication/proceedings/conference/journal venue 字段；如果只有 DOI/URL，当前离线规则也无法推出 venue。";
    }
    return "原因：读取到了候选 venue，但没有足够证据匹配到 CCF 目录。";
  }

  if (diagnostics.result.status === "none") {
    return "原因：候选 venue 未命中当前本地 CCF 目录（2026 国际 A/B/C + 2025 高质量期刊 T1/T2/T3），或被 Findings/Companion/Extended Abstracts/Workshop 等严格规则保留为 CCF None。";
  }

  if (diagnostics.result.status === "preprint") {
    return "原因：检测到 arXiv/preprint 信号，且没有更强的正式 venue 候选。";
  }

  if (diagnostics.result.rank?.startsWith("T")) {
    return "原因：候选 venue 命中本地 CCF 2025 计算领域高质量科技期刊目录。";
  }

  return "原因：候选 venue 命中本地 CCF 2026 推荐国际学术会议和期刊目录。";
}

export function getItemDiagnostics(item: Zotero.Item): ItemDiagnostics {
  const resolution = resolveVenueCandidates(item);
  return {
    itemType: item.itemType,
    fields: inspectedFields
      .map((field) => ({ field, value: getField(item, field) }))
      .filter((entry) => entry.value),
    candidates: resolution.candidates,
    isPreprint: resolution.isPreprint,
    result: matchCandidates(resolution.candidates, resolution.isPreprint),
  };
}

export function formatItemDiagnostics(item: Zotero.Item): string {
  const diagnostics = getItemDiagnostics(item);
  const lines = [
    "CCF 识别诊断",
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

  lines.push("", "候选 venue：");
  if (diagnostics.candidates.length) {
    diagnostics.candidates.forEach((candidate, index) => {
      const kind = candidate.kindHint ? `, ${candidate.kindHint}` : "";
      const context = candidate.context ? `, context=${candidate.context}` : "";
      lines.push(
        `${index + 1}. [${candidate.field}${kind}${context}] ${candidate.value}`,
      );
    });
  } else {
    lines.push("- 无候选 venue");
  }

  lines.push("", "最终判定：", formatResult(diagnostics.result));
  lines.push("", explainResult(diagnostics));

  return lines.join("\n");
}
