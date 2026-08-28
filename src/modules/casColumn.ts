import { config } from "../../package.json";
import { getCASColumnDisplayState } from "./casService";
import { CASItemState, CASPlacement } from "./casTypes";

const dataKey = "ccfForZoteroCAS";
const sortDataSeparator = "\u001e";
const cellTitleSeparator = "\u001f";

function packCASColumnData(
  sortKey: string,
  display: string,
  title = display,
): string {
  const cellData =
    title === display ? display : `${display}${cellTitleSeparator}${title}`;
  return `${sortKey}${sortDataSeparator}${cellData}`;
}

export function unpackCASColumnData(data: string): {
  sortKey: string;
  display: string;
  title: string;
} {
  const [sortKey, cellData = ""] = data.includes(sortDataSeparator)
    ? data.split(sortDataSeparator)
    : ["900", data];
  const [display, title] = cellData.split(cellTitleSeparator);
  return {
    sortKey,
    display: display || "",
    title: title || display || "",
  };
}

function formatTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function primaryPlacement(placements?: CASPlacement[]): CASPlacement | undefined {
  return placements?.[0];
}

function formatPlacement(placement?: CASPlacement): string | undefined {
  if (!placement) return undefined;
  return `${placement.category} ${placement.zone}区`;
}

function formatPlacementList(placements?: CASPlacement[]): string | undefined {
  if (!placements?.length) return undefined;
  return placements
    .slice(0, 2)
    .map((placement) => formatPlacement(placement))
    .filter(Boolean)
    .join("；");
}

function getDisplayName(state: CASItemState): string {
  return (
    state.abbreviation ||
    state.journalTitle ||
    state.venueText ||
    "Journal"
  );
}

function getSortKey(state: CASItemState, display: string): string {
  if (state.status === "ignored") return "990";
  if (state.status === "matched") {
    const placement = primaryPlacement(state.majorPlacements || state.minorPlacements);
    const zone = placement?.zone || 4;
    return `${String(zone).padStart(3, "0")}|${getDisplayName(state)}`;
  }
  if (state.status === "not-listed") return `700|${display}`;
  if (state.status === "unknown") return `800|${display}`;
  if (state.status === "not-applicable") return `900|${display}`;
  if (state.status === "data-missing") return `950|${display}`;
  return `999|${display}`;
}

function buildCASTooltip(state: CASItemState, display: string): string {
  if (!display) return "";
  const lines = [display];
  const major = formatPlacementList(state.majorPlacements);
  const minor = formatPlacementList(state.minorPlacements);
  if (major) {
    lines.push(`大类：${major}${state.isTop ? " · Top" : ""}`);
  }
  if (minor) {
    lines.push(`小类：${minor}`);
  }
  if (state.isWarned) {
    lines.push("预警：是");
  }
  const source = state.matchedField
    ? `${state.matchedField}${state.matchMethod ? ` · ${state.matchMethod}` : ""}`
    : state.matchMethod;
  if (source) lines.push(`来源：${source}`);
  const updatedAt = formatTimestamp(state.updatedAt);
  if (updatedAt) lines.push(`更新：${updatedAt}`);
  return lines.slice(0, 5).join("\n");
}

export function formatCASColumnDataForState(state: CASItemState): string {
  let display = "";
  let title = "";

  if (state.status === "ignored") {
    return packCASColumnData(getSortKey(state, display), display, title);
  }

  if (state.status === "matched") {
    const placement = primaryPlacement(state.majorPlacements || state.minorPlacements);
    if (placement) {
      display = `CAS ${placement.zone}区 | ${getDisplayName(state)}`;
    } else {
      display = `CAS | ${getDisplayName(state)}`;
    }
  } else if (state.status === "not-listed") {
    display = `CAS None | ${state.venueText || "Journal"}`;
  } else if (state.status === "not-applicable") {
    display = "N/A";
  } else if (state.status === "data-missing") {
    display = "CAS 数据未内置";
  } else {
    display = "Unknown";
  }

  title = buildCASTooltip(state, display);
  return packCASColumnData(getSortKey(state, display), display, title);
}

function getCASBadgeColors(text: string) {
  if (text.startsWith("CAS 1区 |")) {
    return { background: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  }
  if (text.startsWith("CAS 2区 |")) {
    return { background: "#e0f2fe", color: "#075985", border: "#bae6fd" };
  }
  if (text.startsWith("CAS 3区 |")) {
    return { background: "#fef3c7", color: "#92400e", border: "#fde68a" };
  }
  if (text.startsWith("CAS 4区 |")) {
    return { background: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  }
  if (text.startsWith("CAS None |")) {
    return { background: "#f1e5f6", color: "#7a2c8f", border: "#e0c8e8" };
  }
  if (text === "N/A") {
    return { background: "#edf0f4", color: "#52616b", border: "#d4dae2" };
  }
  if (text === "CAS 数据未内置") {
    return { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" };
  }
  return { background: "#f4e8e8", color: "#9b2c2c", border: "#e8c9c9" };
}

export async function registerCASColumn() {
  await Zotero.ItemTreeManager.registerColumns({
    pluginID: config.addonID,
    dataKey,
    label: "CAS",
    width: "145",
    zoteroPersist: ["width", "hidden", "sortDirection"],
    dataProvider: (item: Zotero.Item) => {
      if (!item || item.isAttachment() || item.isNote()) return "";
      try {
        return formatCASColumnDataForState(
          getCASColumnDisplayState(item),
        );
      } catch (error) {
        ztoolkit.log("CAS column dataProvider failed", error);
        return formatCASColumnDataForState({
          itemKey: `${item.libraryID}:${item.id}`,
          status: "unknown",
          source: "auto",
          confidence: 0,
          updatedAt: new Date().toISOString(),
        });
      }
    },
    renderCell: (
      index: number,
      data: string,
      column: any,
      isFirstColumn: boolean,
      doc: Document,
    ) => {
      const cellData = unpackCASColumnData(data);
      const cell = doc.createElement("span");
      cell.className = `cell ${column.className}`;
      cell.title = cellData.title || "";
      cell.style.overflow = "hidden";
      cell.style.textOverflow = "ellipsis";
      cell.style.whiteSpace = "nowrap";
      cell.style.minWidth = "0";

      if (!cellData.display) return cell;

      const colors = getCASBadgeColors(cellData.display);
      const badge = doc.createElement("span");
      badge.textContent = cellData.display;
      badge.style.display = "inline-block";
      badge.style.maxWidth = "100%";
      badge.style.minWidth = "0";
      badge.style.boxSizing = "border-box";
      badge.style.padding = "2px 8px";
      badge.style.border = `1px solid ${colors.border}`;
      badge.style.borderRadius = "6px";
      badge.style.backgroundColor = colors.background;
      badge.style.color = colors.color;
      badge.style.fontWeight = "650";
      badge.style.lineHeight = "1.3";
      badge.style.whiteSpace = "nowrap";
      badge.style.overflow = "hidden";
      badge.style.textOverflow = "ellipsis";
      badge.style.verticalAlign = "middle";
      cell.appendChild(badge);
      return cell;
    },
  });
}
