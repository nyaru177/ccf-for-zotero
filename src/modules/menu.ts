import {
  getVenueKindLabel,
  groupVenuesForBrowse,
  openManualVenueSelector,
  venueToManualResult,
} from "./manualSelector";
import { formatItemDiagnostics } from "./diagnostics";
import { getDisplayState, refreshItemsRank } from "./rankService";
import { clearItemStates, ignoreItems, saveManualMatches } from "./storage";
import { CCFKind, CCFRank, CCFVenue, MatchResult } from "./types";
import { resolveVenueCandidates } from "./venueResolver";

const REFRESH_YIELD_EVERY = 10;
const REFRESH_SAVE_BATCH_SIZE = 500;
const PROGRESS_UPDATE_EVERY = 25;

type RefreshViewMode = "full" | "soft";

interface ActiveRefreshJob {
  id: number;
  cancelRequested: boolean;
  progressWindow?: ReturnType<typeof createProgressWindow>;
}

let nextRefreshJobID = 1;
let activeRefreshJob: ActiveRefreshJob | undefined;

const text = {
  root: "CCF 分级助手",
  refresh: "刷新所选条目的 CCF 分级",
  refreshUnknownNone: "只刷新 Unknown / CCF None",
  clearAndRefresh: "清除缓存并重新识别所选条目",
  cancelRefresh: "取消当前 CCF 刷新",
  diagnostics: "显示识别诊断",
  manual: "搜索 CCF 会议/期刊并设置...",
  browse: "按 CCF 分类浏览手动设置...",
  ignore: "忽略所选条目",
  restore: "恢复自动匹配",
  noSelection: "没有选中可刷新的普通条目。",
  noUnknownNoneSelection: "所选条目中没有 Unknown 或 CCF None。",
  noActiveRefresh: "当前没有正在运行的 CCF 刷新任务。",
  refreshAlreadyRunning:
    "已有 CCF 刷新任务正在运行。请先取消当前任务或等待完成。",
  manualDone: (count: number, venue: CCFVenue) =>
    `已为 ${count} 个条目设置为 CCF ${venue.rank} | ${venue.abbr}。`,
  ignoredDone: (count: number) => `已忽略 ${count} 个条目。`,
  restoredDone: (count: number) => `已恢复 ${count} 个条目的自动匹配。`,
  refreshTitle: "CCF 分级刷新",
  refreshStart: (count: number) => `准备刷新 ${count} 个条目...`,
  refreshProgress: (done: number, total: number, title: string) =>
    `正在刷新 ${done}/${total}：${title}`,
  refreshCancelHint:
    "如需停止，请用顶部 Tools/工具 菜单或右键菜单：CCF 分级助手 -> 取消当前 CCF 刷新。已完成的结果会保留。",
  refreshCancelRequested: "正在取消刷新，将保存已完成的结果...",
  refreshDone: (
    count: number,
    summary: { matched: number; none: number; preprint: number; unknown: number },
  ) =>
    `完成：${count} 个条目；匹配 ${summary.matched}，CCF None ${summary.none}，Preprint ${summary.preprint}，Unknown ${summary.unknown}`,
  refreshCancelled: (
    done: number,
    total: number,
    summary: { matched: number; none: number; preprint: number; unknown: number },
  ) =>
    `已取消：完成 ${done}/${total}；匹配 ${summary.matched}，CCF None ${summary.none}，Preprint ${summary.preprint}，Unknown ${summary.unknown}`,
  refreshFailed: "刷新失败，请查看 Zotero 错误日志。",
};

const kindOrder: CCFKind[] = ["conference", "journal"];
const rankOrder: CCFRank[] = ["A", "B", "C"];

function getSelectedRegularItems(): Zotero.Item[] {
  const items = Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
  return items.filter((item) => item.isRegularItem());
}

function getItemIDs(items: Zotero.Item[]) {
  return items.map((item) => item.id).filter((id) => typeof id === "number");
}

function callViewMethod(target: any, method: string) {
  if (typeof target?.[method] !== "function") return false;
  target[method]();
  return true;
}

function refreshItemsView(items: Zotero.Item[] = [], mode: RefreshViewMode = "full") {
  const ids = getItemIDs(items);
  if (mode === "soft" && ids.length > 0) {
    const itemsView = Zotero.getActiveZoteroPane()?.itemsView as any;
    if (
      callViewMethod(itemsView, "forceUpdate") ||
      callViewMethod(itemsView, "invalidate") ||
      callViewMethod(itemsView?.tree, "invalidate") ||
      callViewMethod(itemsView?._tree, "invalidate")
    ) {
      return;
    }
    Zotero.Notifier.trigger("refresh", "item", ids);
    return;
  }

  const itemsView = Zotero.getActiveZoteroPane()?.itemsView;
  if ((itemsView as any)?.refreshAndMaintainSelection) {
    (itemsView as any).refreshAndMaintainSelection();
  } else {
    Zotero.Notifier.trigger("refresh", "item", []);
  }
}

function alertUser(win: Window, message: string) {
  (win as any).alert?.(message);
}

function delay(win: Window, ms = 0) {
  return new Promise<void>((resolve) => {
    const setTimeoutFromWindow = (win as any).setTimeout;
    if (setTimeoutFromWindow) {
      setTimeoutFromWindow.call(win, resolve, ms);
    } else {
      setTimeout(resolve, ms);
    }
  });
}

function truncate(value: string, maxLength = 48) {
  const chars = [...value.trim()];
  if (chars.length <= maxLength) return value.trim();
  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function getItemTitle(item: Zotero.Item) {
  return truncate(item.getField("title") || `条目 ${item.id}`);
}

function getSuggestedQuery(items: Zotero.Item[]) {
  const firstItem = items[0];
  if (!firstItem) return "";
  return resolveVenueCandidates(firstItem).candidates.find((candidate) =>
    candidate.value.trim(),
  )?.value || "";
}

function createProgressWindow(win: Window, count: number) {
  try {
    return new ztoolkit.ProgressWindow(text.refreshTitle, {
      window: win,
      closeOnClick: false,
      closeOtherProgressWindows: true,
    })
      .createLine({
        text: text.refreshStart(count),
        progress: 0,
      })
      .addDescription(text.refreshCancelHint)
      .show(-1);
  } catch (error) {
    ztoolkit.log("Could not open CCF refresh progress window", error);
    return undefined;
  }
}

function countResult(
  summary: { matched: number; none: number; preprint: number; unknown: number },
  result: MatchResult,
) {
  if (result.status === "matched") summary.matched += 1;
  if (result.status === "none") summary.none += 1;
  if (result.status === "preprint") summary.preprint += 1;
  if (result.status === "unknown") summary.unknown += 1;
}

async function refreshItemsWithProgress(win: Window, items: Zotero.Item[]) {
  if (items.length === 0) {
    alertUser(win, text.noSelection);
    return;
  }
  if (activeRefreshJob) {
    alertUser(win, text.refreshAlreadyRunning);
    return;
  }

  const job: ActiveRefreshJob = {
    id: nextRefreshJobID++,
    cancelRequested: false,
  };
  const progressWindow = createProgressWindow(win, items.length);
  job.progressWindow = progressWindow;
  activeRefreshJob = job;
  const summary = { matched: 0, none: 0, preprint: 0, unknown: 0 };

  try {
    const result = await refreshItemsRank(items, {
      saveBatchSize: REFRESH_SAVE_BATCH_SIZE,
      shouldCancel: () => job.cancelRequested,
      onProgress: async (done, total, item, matchResult) => {
        countResult(summary, matchResult);
        if (
          progressWindow &&
          (done === 1 || done === total || done % PROGRESS_UPDATE_EVERY === 0)
        ) {
          progressWindow.changeLine({
            text: job.cancelRequested
              ? text.refreshCancelRequested
              : text.refreshProgress(done, total, getItemTitle(item)),
            progress: Math.round((done / total) * 100),
          });
        }

        if (done % REFRESH_YIELD_EVERY === 0) {
          await delay(win, 0);
        }
      },
    });

    refreshItemsView(
      result.entries.map((entry) => entry.item),
      "soft",
    );
    if (progressWindow) {
      if (result.cancelled) {
        progressWindow
          .changeLine({
            text: text.refreshCancelled(result.processed, result.total, summary),
            progress: Math.round((result.processed / result.total) * 100),
          })
          .startCloseTimer(5000);
      } else {
        progressWindow
          .changeLine({
            type: "success",
            text: text.refreshDone(result.processed, summary),
            progress: 100,
          })
          .startCloseTimer(4000);
      }
    } else if (result.cancelled) {
      alertUser(win, text.refreshCancelled(result.processed, result.total, summary));
    } else {
      alertUser(win, text.refreshDone(result.processed, summary));
    }
  } catch (error) {
    ztoolkit.log("CCF refresh failed", error);
    if (progressWindow) {
      progressWindow
        .changeLine({ type: "fail", text: text.refreshFailed, progress: 100 })
        .startCloseTimer(6000);
    } else {
      alertUser(win, text.refreshFailed);
    }
  } finally {
    if (activeRefreshJob?.id === job.id) {
      activeRefreshJob = undefined;
    }
  }
}

function cancelActiveRefresh(win: Window) {
  if (!activeRefreshJob) {
    alertUser(win, text.noActiveRefresh);
    return;
  }

  activeRefreshJob.cancelRequested = true;
  activeRefreshJob.progressWindow?.changeLine({
    text: text.refreshCancelRequested,
  });
}

function setMenuItemDisabled(item: Element, disabled: boolean) {
  if (disabled) {
    item.setAttribute("disabled", "true");
  } else {
    item.removeAttribute("disabled");
  }
}

async function refreshSelectedItems(win: Window) {
  await refreshItemsWithProgress(win, getSelectedRegularItems());
}

async function refreshSelectedUnknownNoneItems(win: Window) {
  const items = getSelectedRegularItems().filter((item) => {
    try {
      const state = getDisplayState(item);
      return state.status === "unknown" || state.status === "none";
    } catch (error) {
      ztoolkit.log("Could not filter CCF Unknown/None item", error);
      return false;
    }
  });

  if (items.length === 0) {
    alertUser(win, text.noUnknownNoneSelection);
    return;
  }

  await refreshItemsWithProgress(win, items);
}

async function clearSelectedCacheAndRefresh(win: Window) {
  const items = getSelectedRegularItems();
  if (items.length === 0) {
    alertUser(win, text.noSelection);
    return;
  }

  clearItemStates(items);
  await refreshItemsWithProgress(win, items);
}

function showSelectedDiagnostics(win: Window) {
  const item = getSelectedRegularItems()[0];
  if (!item) {
    alertUser(win, text.noSelection);
    return;
  }

  alertUser(win, formatItemDiagnostics(item));
}

function setManualVenue(win: Window, items: Zotero.Item[], venue: CCFVenue) {
  saveManualMatches(items, venueToManualResult(venue));
  refreshItemsView();
  alertUser(win, text.manualDone(items.length, venue));
}

async function selectManualVenue(win: Window) {
  const items = getSelectedRegularItems();
  if (items.length === 0) {
    alertUser(win, text.noSelection);
    return;
  }

  const venue = await openManualVenueSelector(win, getSuggestedQuery(items));
  if (!venue) return;
  setManualVenue(win, items, venue);
}

function countVenueAbbrs(
  groups: Map<CCFKind, Map<string, Map<CCFRank, CCFVenue[]>>>,
) {
  const counts = new Map<string, number>();
  for (const categoryMap of groups.values()) {
    for (const rankMap of categoryMap.values()) {
      for (const venues of rankMap.values()) {
        for (const venue of venues) {
          counts.set(venue.abbr, (counts.get(venue.abbr) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function createManualVenueMenuItem(
  doc: Document,
  win: Window,
  venue: CCFVenue,
  abbrCounts: Map<string, number>,
) {
  const item = doc.createXULElement("menuitem");
  const label =
    (abbrCounts.get(venue.abbr) || 0) > 1
      ? `${venue.abbr} - ${venue.fullName}`
      : venue.abbr;
  item.setAttribute("label", label);
  item.setAttribute("tooltiptext", venue.fullName);
  item.addEventListener("command", () => {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      alertUser(win, text.noSelection);
      return;
    }
    setManualVenue(win, items, venue);
  });
  return item;
}

function appendBrowseMenu(
  doc: Document,
  win: _ZoteroTypes.MainWindow,
  popup: Element,
) {
  const browse = doc.createXULElement("menu");
  browse.setAttribute("label", text.browse);
  const browsePopup = doc.createXULElement("menupopup");
  browse.appendChild(browsePopup);

  const groups = groupVenuesForBrowse();
  const abbrCounts = countVenueAbbrs(groups);
  for (const kind of kindOrder) {
    const categoryMap = groups.get(kind);
    if (!categoryMap) continue;

    const kindMenu = doc.createXULElement("menu");
    kindMenu.setAttribute("label", getVenueKindLabel(kind));
    const kindPopup = doc.createXULElement("menupopup");
    kindMenu.appendChild(kindPopup);

    const categories = [...categoryMap.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "zh-CN"),
    );
    for (const [category, rankMap] of categories) {
      const categoryMenu = doc.createXULElement("menu");
      categoryMenu.setAttribute("label", category);
      const categoryPopup = doc.createXULElement("menupopup");
      categoryMenu.appendChild(categoryPopup);

      for (const rank of rankOrder) {
        const venues = rankMap.get(rank);
        if (!venues?.length) continue;

        const rankMenu = doc.createXULElement("menu");
        rankMenu.setAttribute("label", `CCF ${rank}`);
        const rankPopup = doc.createXULElement("menupopup");
        rankMenu.appendChild(rankPopup);

        for (const venue of venues) {
          rankPopup.appendChild(
            createManualVenueMenuItem(doc, win, venue, abbrCounts),
          );
        }
        categoryPopup.appendChild(rankMenu);
      }
      kindPopup.appendChild(categoryMenu);
    }
    browsePopup.appendChild(kindMenu);
  }

  popup.appendChild(browse);
}

function updateRefreshMenuState(cancelItem: Element, refreshItems: Element[]) {
  const isRefreshing = Boolean(activeRefreshJob);
  setMenuItemDisabled(cancelItem, !isRefreshing);
  for (const item of refreshItems) {
    setMenuItemDisabled(item, isRefreshing);
  }
}

export function registerRightClickMenu(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  const menu = doc.getElementById("zotero-itemmenu");
  if (!menu || doc.getElementById("ccf-for-zotero-menu")) return;

  const root = doc.createXULElement("menu");
  root.setAttribute("id", "ccf-for-zotero-menu");
  root.setAttribute("label", text.root);

  const popup = doc.createXULElement("menupopup");
  root.appendChild(popup);

  const refresh = doc.createXULElement("menuitem");
  refresh.setAttribute("label", text.refresh);
  refresh.addEventListener("command", () => void refreshSelectedItems(win));
  popup.appendChild(refresh);

  const refreshUnknownNone = doc.createXULElement("menuitem");
  refreshUnknownNone.setAttribute("label", text.refreshUnknownNone);
  refreshUnknownNone.addEventListener(
    "command",
    () => void refreshSelectedUnknownNoneItems(win),
  );
  popup.appendChild(refreshUnknownNone);

  const clearAndRefresh = doc.createXULElement("menuitem");
  clearAndRefresh.setAttribute("label", text.clearAndRefresh);
  clearAndRefresh.addEventListener(
    "command",
    () => void clearSelectedCacheAndRefresh(win),
  );
  popup.appendChild(clearAndRefresh);

  const cancelRefresh = doc.createXULElement("menuitem");
  cancelRefresh.setAttribute("label", text.cancelRefresh);
  cancelRefresh.addEventListener("command", () => cancelActiveRefresh(win));
  popup.appendChild(cancelRefresh);
  popup.addEventListener("popupshowing", () =>
    updateRefreshMenuState(cancelRefresh, [
      refresh,
      refreshUnknownNone,
      clearAndRefresh,
    ]),
  );

  const diagnostics = doc.createXULElement("menuitem");
  diagnostics.setAttribute("label", text.diagnostics);
  diagnostics.addEventListener("command", () => showSelectedDiagnostics(win));
  popup.appendChild(diagnostics);

  popup.appendChild(doc.createXULElement("menuseparator"));

  const manual = doc.createXULElement("menuitem");
  manual.setAttribute("label", text.manual);
  manual.addEventListener("command", () => void selectManualVenue(win));
  popup.appendChild(manual);

  appendBrowseMenu(doc, win, popup);
  popup.appendChild(doc.createXULElement("menuseparator"));

  const ignore = doc.createXULElement("menuitem");
  ignore.setAttribute("label", text.ignore);
  ignore.addEventListener("command", () => {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      alertUser(win, text.noSelection);
      return;
    }
    ignoreItems(items);
    refreshItemsView();
    alertUser(win, text.ignoredDone(items.length));
  });
  popup.appendChild(ignore);

  const restore = doc.createXULElement("menuitem");
  restore.setAttribute("label", text.restore);
  restore.addEventListener("command", () => {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      alertUser(win, text.noSelection);
      return;
    }
    clearItemStates(items);
    refreshItemsView();
    alertUser(win, text.restoredDone(items.length));
  });
  popup.appendChild(restore);

  menu.appendChild(root);
}

export function registerToolsMenu(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  if (doc.getElementById("ccf-for-zotero-tools-menu")) return;

  const toolsPopup =
    doc.getElementById("menu_ToolsPopup") ||
    doc.getElementById("tools-menu-popup");
  if (!toolsPopup) {
    ztoolkit.log("Could not find Zotero Tools menu for CCF controls");
    return;
  }

  const root = doc.createXULElement("menu");
  root.setAttribute("id", "ccf-for-zotero-tools-menu");
  root.setAttribute("label", text.root);

  const popup = doc.createXULElement("menupopup");
  root.appendChild(popup);

  const refresh = doc.createXULElement("menuitem");
  refresh.setAttribute("label", text.refresh);
  refresh.addEventListener("command", () => void refreshSelectedItems(win));
  popup.appendChild(refresh);

  const refreshUnknownNone = doc.createXULElement("menuitem");
  refreshUnknownNone.setAttribute("label", text.refreshUnknownNone);
  refreshUnknownNone.addEventListener(
    "command",
    () => void refreshSelectedUnknownNoneItems(win),
  );
  popup.appendChild(refreshUnknownNone);

  popup.appendChild(doc.createXULElement("menuseparator"));

  const cancelRefresh = doc.createXULElement("menuitem");
  cancelRefresh.setAttribute("label", text.cancelRefresh);
  cancelRefresh.addEventListener("command", () => cancelActiveRefresh(win));
  popup.appendChild(cancelRefresh);
  popup.addEventListener("popupshowing", () =>
    updateRefreshMenuState(cancelRefresh, [refresh, refreshUnknownNone]),
  );

  toolsPopup.appendChild(root);
}
