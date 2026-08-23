import { config } from "../../package.json";
import { formatNonCcfVenueText } from "./nonCcfAliases";
import { getDisplayState } from "./rankService";
import { ItemRankState } from "./types";

const dataKey = "ccfForZoteroRank";
const cellTitleSeparator = "\u001f";

function packCellData(display: string, title = display): string {
  return title === display ? display : `${display}${cellTitleSeparator}${title}`;
}

function unpackCellData(data: string): { display: string; title: string } {
  const [display, title] = data.split(cellTitleSeparator);
  return { display: display || "", title: title || display || "" };
}

function formatState(state: ItemRankState): string {
  if (state.status === "ignored") return "";
  if (state.status === "preprint") return "Preprint | arXiv";
  if (state.status === "unknown") return "Unknown";
  if (state.status === "none") {
    const originalVenue = state.venueText || "Venue";
    const displayVenue = formatNonCcfVenueText(originalVenue);
    return packCellData(
      `CCF None | ${displayVenue}`,
      `CCF None | ${originalVenue}`,
    );
  }
  if (state.rank && state.abbr) return `CCF ${state.rank} | ${state.abbr}`;
  return "Unknown";
}

function getBadgeColors(text: string) {
  if (text.startsWith("CCF A |")) {
    return { background: "#dff3e8", color: "#146c43", border: "#b7dfc8" };
  }
  if (text.startsWith("CCF B |")) {
    return { background: "#e8eefc", color: "#2f56a6", border: "#c8d5f6" };
  }
  if (text.startsWith("CCF C |")) {
    return { background: "#fff2cc", color: "#8a5a00", border: "#ead083" };
  }
  if (text.startsWith("Preprint |")) {
    return { background: "#edf0f4", color: "#52616b", border: "#d4dae2" };
  }
  if (text.startsWith("CCF None |")) {
    return { background: "#f1e5f6", color: "#7a2c8f", border: "#e0c8e8" };
  }
  return { background: "#f4e8e8", color: "#9b2c2c", border: "#e8c9c9" };
}

export async function registerCCFColumn() {
  await Zotero.ItemTreeManager.registerColumns({
    pluginID: config.addonID,
    dataKey,
    label: "CCF",
    width: "130",
    zoteroPersist: ["width", "hidden", "sortDirection"],
    dataProvider: (item: Zotero.Item) => {
      if (!item || item.isAttachment() || item.isNote()) return "";
      try {
        return formatState(getDisplayState(item));
      } catch (error) {
        ztoolkit.log("CCF column dataProvider failed", error);
        return "Unknown";
      }
    },
    renderCell: (
      index: number,
      data: string,
      column: any,
      isFirstColumn: boolean,
      doc: Document,
    ) => {
      const cellData = unpackCellData(data);
      const cell = doc.createElement("span");
      cell.className = `cell ${column.className}`;
      cell.title = cellData.title || "";
      cell.style.overflow = "hidden";
      cell.style.textOverflow = "ellipsis";
      cell.style.whiteSpace = "nowrap";
      cell.style.minWidth = "0";

      if (!cellData.display) return cell;

      const colors = getBadgeColors(cellData.display);
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


