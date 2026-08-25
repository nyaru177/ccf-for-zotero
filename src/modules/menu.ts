import {
  getVenueKindLabel,
  groupVenuesForBrowse,
  openManualVenueSelector,
  venueToManualResult,
} from "./manualSelector";
import { hasBundledCASSnapshot } from "./casCatalog";
import { formatCASItemDiagnostics } from "./casDiagnostics";
import { filterCASItemsByDisplayStatus, refreshCASItems } from "./casService";
import { clearCASItemStates, ignoreCASItems } from "./casStorage";
import { CASItemState, CASMatchResult } from "./casTypes";
import { formatItemDiagnostics } from "./diagnostics";
import { filterItemsByDisplayStatus, refreshItemsRank } from "./rankService";
import { clearItemStates, ignoreItems, saveManualMatches } from "./storage";
import { CCFKind, CCFRank, CCFVenue, ItemRankState, MatchResult } from "./types";
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

interface RefreshItemsWithProgressOptions {
  filterStatuses?: Array<ItemRankState["status"]>;
  noMatchedItemsMessage?: string;
}

let nextRefreshJobID = 1;
let activeRefreshJob: ActiveRefreshJob | undefined;
let activeCASRefreshJob: ActiveRefreshJob | undefined;

const text = {
  root: "CCF/CAS 分级助手",
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
  refreshStart: (count: number) => `准备刷新 ${count} 个条目`,
  refreshScan: (done: number, total: number, title: string) =>
    `筛选 ${done}/${total}：${title}`,
  refreshProgress: (done: number, total: number, title: string) =>
    `正在刷新 ${done}/${total}：${title}`,
  refreshCancelHint: "可在 Tools/工具 菜单取消，已完成保留。",
  refreshCancelRequested: "正在取消，将保存已完成结果...",
  refreshDone: (
    count: number,
    summary: { matched: number; none: number; preprint: number; unknown: number },
  ) =>
    `完成 ${count} 条：匹配 ${summary.matched}，None ${summary.none}，Preprint ${summary.preprint}，Unknown ${summary.unknown}`,
  refreshCancelled: (
    done: number,
    total: number,
    summary: { matched: number; none: number; preprint: number; unknown: number },
  ) =>
    `已取消 ${done}/${total}：匹配 ${summary.matched}，None ${summary.none}，Preprint ${summary.preprint}，Unknown ${summary.unknown}`,
  refreshFailed: (message: string) => `刷新失败：${message}`,
};

const casText = {
  refresh: "CAS：刷新所选条目的中科院分区",
  refreshUnknownNone: "CAS：只刷新 Unknown / CAS None",
  clearAndRefresh: "CAS：清除缓存并重新识别",
  cancelRefresh: "CAS：取消当前刷新",
  diagnostics: "CAS：显示识别诊断",
  ignore: "CAS：忽略所选条目",
  restore: "CAS：恢复自动匹配",
  noUnknownNoneSelection: "所选条目中没有 Unknown 或 CAS None。",
  noSnapshot:
    "当前版本未内置可用 CAS 官方/授权快照；确认数据后再刷新。",
  noActiveRefresh: "当前没有正在运行的 CAS 刷新任务。",
  refreshAlreadyRunning:
    "已有 CAS 刷新任务正在运行。请先取消当前任务或等待完成。",
  ignoredDone: (count: number) => `已忽略 ${count} 个条目的 CAS 分区。`,
  restoredDone: (count: number) =>
    `已恢复 ${count} 个条目的 CAS 自动匹配。`,
  refreshTitle: "CAS 中科院分区刷新",
  refreshStart: (count: number) => `准备刷新 ${count} 个条目`,
  refreshScan: (done: number, total: number, title: string) =>
    `筛选 ${done}/${total}：${title}`,
  refreshProgress: (done: number, total: number, title: string) =>
    `正在刷新 ${done}/${total}：${title}`,
  refreshCancelRequested: "正在取消，将保存已完成结果...",
  refreshDone: (
    count: number,
    summary: {
      matched: number;
      none: number;
      unknown: number;
      notApplicable: number;
    },
  ) =>
    `完成 ${count} 条：匹配 ${summary.matched}，None ${summary.none}，Unknown ${summary.unknown}，N/A ${summary.notApplicable}`,
  refreshCancelled: (
    done: number,
    total: number,
    summary: {
      matched: number;
      none: number;
      unknown: number;
      notApplicable: number;
    },
  ) =>
    `已取消 ${done}/${total}：匹配 ${summary.matched}，None ${summary.none}，Unknown ${summary.unknown}，N/A ${summary.notApplicable}`,
  refreshFailed: (message: string) => `CAS 刷新失败：${message}`,
};

const kindOrder: CCFKind[] = ["conference", "journal"];
const rankOrder: CCFRank[] = ["A", "B", "C", "T1", "T2", "T3"];

function getSelectedRegularItems(): Zotero.Item[] {
  const items = Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
  return items.filter((item) => item.isRegularItem());
}

function getItemIDs(items: Zotero.Item[]) {
  return items.map((item) => item.id).filter((id) => typeof id === "number");
}

function callViewMethod(target: any, method: string) {
  if (typeof target?.[method] !== "function") return false;
  try {
    target[method]();
    return true;
  } catch (error) {
    ztoolkit.log(`Could not refresh CCF item view via ${method}`, error);
    return false;
  }
}

function triggerItemTreeRefresh(ids: number[]) {
  try {
    const result = Zotero.Notifier.trigger("refresh", "item", ids);
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch((error) => {
        ztoolkit.log("Could not notify CCF item refresh", error);
      });
    }
  } catch (error) {
    ztoolkit.log("Could not trigger CCF item refresh", error);
  }
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
    triggerItemTreeRefresh(ids);
    return;
  }

  const itemsView = Zotero.getActiveZoteroPane()?.itemsView;
  if (!callViewMethod(itemsView, "refreshAndMaintainSelection")) {
    triggerItemTreeRefresh([]);
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

function truncate(value: string, maxLength = 36) {
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
      .show(-1);
  } catch (error) {
    ztoolkit.log("Could not open CCF refresh progress window", error);
    return undefined;
  }
}

function createCASProgressWindow(win: Window, count: number) {
  try {
    return new ztoolkit.ProgressWindow(casText.refreshTitle, {
      window: win,
      closeOnClick: false,
      closeOtherProgressWindows: true,
    })
      .createLine({
        text: casText.refreshStart(count),
        progress: 0,
      })
      .show(-1);
  } catch (error) {
    ztoolkit.log("Could not open CAS refresh progress window", error);
    return undefined;
  }
}

function updateProgressWindow(
  progressWindow: ReturnType<typeof createProgressWindow>,
  line: { type?: string; text?: string; progress?: number },
  closeAfterMs?: number,
) {
  if (!progressWindow) return;
  try {
    progressWindow.changeLine(line);
    if (closeAfterMs !== undefined) {
      progressWindow.startCloseTimer(closeAfterMs);
    }
  } catch (error) {
    ztoolkit.log("Could not update CCF refresh progress window", error);
  }
}

function formatErrorMessage(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "请查看 Zotero 错误日志";
  return truncate(raw, 90);
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

function countCASResult(
  summary: { matched: number; none: number; unknown: number; notApplicable: number },
  result: CASMatchResult,
) {
  if (result.status === "matched") summary.matched += 1;
  if (result.status === "not-listed") summary.none += 1;
  if (result.status === "unknown") summary.unknown += 1;
  if (result.status === "not-applicable") summary.notApplicable += 1;
}

async function refreshItemsWithProgress(
  win: Window,
  items: Zotero.Item[],
  options: RefreshItemsWithProgressOptions = {},
) {
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
    let itemsToRefresh = items;

    if (options.filterStatuses?.length) {
      const filterResult = await filterItemsByDisplayStatus(
        items,
        options.filterStatuses,
        {
          shouldCancel: () => job.cancelRequested,
          onProgress: async (done, total, item) => {
            if (
              progressWindow &&
              (done === 1 ||
                done === total ||
                done % PROGRESS_UPDATE_EVERY === 0)
            ) {
              updateProgressWindow(progressWindow, {
                text: job.cancelRequested
                  ? text.refreshCancelRequested
                  : text.refreshScan(done, total, getItemTitle(item)),
                progress: Math.round((done / total) * 100),
              });
            }

            if (done % REFRESH_YIELD_EVERY === 0) {
              await delay(win, 0);
            }
          },
        },
      );

      if (filterResult.cancelled) {
        updateProgressWindow(
          progressWindow,
          {
            text: text.refreshCancelled(
              filterResult.processed,
              filterResult.total,
              summary,
            ),
            progress: Math.round(
              (filterResult.processed / filterResult.total) * 100,
            ),
          },
          4000,
        );
        return;
      }

      itemsToRefresh = filterResult.items;
      if (itemsToRefresh.length === 0) {
        const message = options.noMatchedItemsMessage || text.noSelection;
        if (progressWindow) {
          updateProgressWindow(
            progressWindow,
            {
              text: message,
              progress: 100,
            },
            3000,
          );
        } else {
          alertUser(win, message);
        }
        return;
      }

      updateProgressWindow(progressWindow, {
        text: `${text.refreshStart(itemsToRefresh.length)}（${text.refreshCancelHint}）`,
        progress: 0,
      });
      await delay(win, 0);
    }

    const result = await refreshItemsRank(itemsToRefresh, {
      saveBatchSize: REFRESH_SAVE_BATCH_SIZE,
      shouldCancel: () => job.cancelRequested,
      onProgress: async (done, total, item, matchResult) => {
        countResult(summary, matchResult);
        if (
          progressWindow &&
          (done === 1 || done === total || done % PROGRESS_UPDATE_EVERY === 0)
        ) {
          updateProgressWindow(progressWindow, {
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
        updateProgressWindow(
          progressWindow,
          {
            text: text.refreshCancelled(result.processed, result.total, summary),
            progress: Math.round((result.processed / result.total) * 100),
          },
          5000,
        );
      } else {
        updateProgressWindow(
          progressWindow,
          {
            type: "success",
            text: text.refreshDone(result.processed, summary),
            progress: 100,
          },
          4000,
        );
      }
    } else if (result.cancelled) {
      alertUser(win, text.refreshCancelled(result.processed, result.total, summary));
    } else {
      alertUser(win, text.refreshDone(result.processed, summary));
    }
  } catch (error) {
    ztoolkit.log("CCF refresh failed", error);
    const failureText = text.refreshFailed(formatErrorMessage(error));
    if (progressWindow) {
      updateProgressWindow(
        progressWindow,
        { type: "fail", text: failureText, progress: 100 },
        6000,
      );
    } else {
      alertUser(win, failureText);
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
  updateProgressWindow(activeRefreshJob.progressWindow, {
    text: text.refreshCancelRequested,
  });
}

async function refreshCASItemsWithProgress(
  win: Window,
  items: Zotero.Item[],
  options: {
    filterStatuses?: Array<CASItemState["status"]>;
    noMatchedItemsMessage?: string;
  } = {},
) {
  if (items.length === 0) {
    alertUser(win, text.noSelection);
    return;
  }
  if (!hasBundledCASSnapshot()) {
    alertUser(win, casText.noSnapshot);
    return;
  }
  if (activeCASRefreshJob) {
    alertUser(win, casText.refreshAlreadyRunning);
    return;
  }

  const job: ActiveRefreshJob = {
    id: nextRefreshJobID++,
    cancelRequested: false,
  };
  const progressWindow = createCASProgressWindow(win, items.length);
  job.progressWindow = progressWindow;
  activeCASRefreshJob = job;
  const summary = { matched: 0, none: 0, unknown: 0, notApplicable: 0 };

  try {
    let itemsToRefresh = items;

    if (options.filterStatuses?.length) {
      const filterResult = await filterCASItemsByDisplayStatus(
        items,
        options.filterStatuses,
        {
          shouldCancel: () => job.cancelRequested,
          onProgress: async (done, total, item) => {
            if (
              progressWindow &&
              (done === 1 ||
                done === total ||
                done % PROGRESS_UPDATE_EVERY === 0)
            ) {
              updateProgressWindow(progressWindow, {
                text: job.cancelRequested
                  ? casText.refreshCancelRequested
                  : casText.refreshScan(done, total, getItemTitle(item)),
                progress: Math.round((done / total) * 100),
              });
            }

            if (done % REFRESH_YIELD_EVERY === 0) {
              await delay(win, 0);
            }
          },
        },
      );

      if (filterResult.cancelled) {
        updateProgressWindow(
          progressWindow,
          {
            text: casText.refreshCancelled(
              filterResult.processed,
              filterResult.total,
              summary,
            ),
            progress: Math.round(
              (filterResult.processed / filterResult.total) * 100,
            ),
          },
          4000,
        );
        return;
      }

      itemsToRefresh = filterResult.items;
      if (itemsToRefresh.length === 0) {
        const message = options.noMatchedItemsMessage || text.noSelection;
        if (progressWindow) {
          updateProgressWindow(
            progressWindow,
            {
              text: message,
              progress: 100,
            },
            3000,
          );
        } else {
          alertUser(win, message);
        }
        return;
      }

      updateProgressWindow(progressWindow, {
        text: `${casText.refreshStart(itemsToRefresh.length)}（${text.refreshCancelHint}）`,
        progress: 0,
      });
      await delay(win, 0);
    }

    const result = await refreshCASItems(itemsToRefresh, {
      saveBatchSize: REFRESH_SAVE_BATCH_SIZE,
      shouldCancel: () => job.cancelRequested,
      onProgress: async (done, total, item, matchResult) => {
        countCASResult(summary, matchResult);
        if (
          progressWindow &&
          (done === 1 || done === total || done % PROGRESS_UPDATE_EVERY === 0)
        ) {
          updateProgressWindow(progressWindow, {
            text: job.cancelRequested
              ? casText.refreshCancelRequested
              : casText.refreshProgress(done, total, getItemTitle(item)),
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
        updateProgressWindow(
          progressWindow,
          {
            text: casText.refreshCancelled(result.processed, result.total, summary),
            progress: Math.round((result.processed / result.total) * 100),
          },
          5000,
        );
      } else {
        updateProgressWindow(
          progressWindow,
          {
            type: "success",
            text: casText.refreshDone(result.processed, summary),
            progress: 100,
          },
          4000,
        );
      }
    } else if (result.cancelled) {
      alertUser(win, casText.refreshCancelled(result.processed, result.total, summary));
    } else {
      alertUser(win, casText.refreshDone(result.processed, summary));
    }
  } catch (error) {
    ztoolkit.log("CAS refresh failed", error);
    const failureText = casText.refreshFailed(formatErrorMessage(error));
    if (progressWindow) {
      updateProgressWindow(
        progressWindow,
        { type: "fail", text: failureText, progress: 100 },
        6000,
      );
    } else {
      alertUser(win, failureText);
    }
  } finally {
    if (activeCASRefreshJob?.id === job.id) {
      activeCASRefreshJob = undefined;
    }
  }
}

function cancelActiveCASRefresh(win: Window) {
  if (!activeCASRefreshJob) {
    alertUser(win, casText.noActiveRefresh);
    return;
  }

  activeCASRefreshJob.cancelRequested = true;
  updateProgressWindow(activeCASRefreshJob.progressWindow, {
    text: casText.refreshCancelRequested,
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
  await refreshItemsWithProgress(win, getSelectedRegularItems(), {
    filterStatuses: ["unknown", "none"],
    noMatchedItemsMessage: text.noUnknownNoneSelection,
  });
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

async function refreshSelectedCASItems(win: Window) {
  await refreshCASItemsWithProgress(win, getSelectedRegularItems());
}

async function refreshSelectedCASUnknownNoneItems(win: Window) {
  await refreshCASItemsWithProgress(win, getSelectedRegularItems(), {
    filterStatuses: ["unknown", "not-listed"],
    noMatchedItemsMessage: casText.noUnknownNoneSelection,
  });
}

async function clearSelectedCASCacheAndRefresh(win: Window) {
  const items = getSelectedRegularItems();
  if (items.length === 0) {
    alertUser(win, text.noSelection);
    return;
  }

  clearCASItemStates(items);
  await refreshCASItemsWithProgress(win, items);
}

function showSelectedDiagnostics(win: Window) {
  const item = getSelectedRegularItems()[0];
  if (!item) {
    alertUser(win, text.noSelection);
    return;
  }

  alertUser(win, formatItemDiagnostics(item));
}

function showSelectedCASDiagnostics(win: Window) {
  const item = getSelectedRegularItems()[0];
  if (!item) {
    alertUser(win, text.noSelection);
    return;
  }

  alertUser(win, formatCASItemDiagnostics(item));
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

function updateCASRefreshMenuState(cancelItem: Element, refreshItems: Element[]) {
  const isRefreshing = Boolean(activeCASRefreshJob);
  setMenuItemDisabled(cancelItem, !isRefreshing);
  for (const item of refreshItems) {
    setMenuItemDisabled(item, isRefreshing);
  }
}

function appendCASMenuSection(
  doc: Document,
  win: _ZoteroTypes.MainWindow,
  popup: Element,
) {
  popup.appendChild(doc.createXULElement("menuseparator"));

  const refresh = doc.createXULElement("menuitem");
  refresh.setAttribute("label", casText.refresh);
  refresh.addEventListener("command", () => void refreshSelectedCASItems(win));
  popup.appendChild(refresh);

  const refreshUnknownNone = doc.createXULElement("menuitem");
  refreshUnknownNone.setAttribute("label", casText.refreshUnknownNone);
  refreshUnknownNone.addEventListener(
    "command",
    () => void refreshSelectedCASUnknownNoneItems(win),
  );
  popup.appendChild(refreshUnknownNone);

  const clearAndRefresh = doc.createXULElement("menuitem");
  clearAndRefresh.setAttribute("label", casText.clearAndRefresh);
  clearAndRefresh.addEventListener(
    "command",
    () => void clearSelectedCASCacheAndRefresh(win),
  );
  popup.appendChild(clearAndRefresh);

  const cancelRefresh = doc.createXULElement("menuitem");
  cancelRefresh.setAttribute("label", casText.cancelRefresh);
  cancelRefresh.addEventListener("command", () => cancelActiveCASRefresh(win));
  popup.appendChild(cancelRefresh);
  popup.addEventListener("popupshowing", () =>
    updateCASRefreshMenuState(cancelRefresh, [
      refresh,
      refreshUnknownNone,
      clearAndRefresh,
    ]),
  );

  const diagnostics = doc.createXULElement("menuitem");
  diagnostics.setAttribute("label", casText.diagnostics);
  diagnostics.addEventListener("command", () => showSelectedCASDiagnostics(win));
  popup.appendChild(diagnostics);

  const ignore = doc.createXULElement("menuitem");
  ignore.setAttribute("label", casText.ignore);
  ignore.addEventListener("command", () => {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      alertUser(win, text.noSelection);
      return;
    }
    ignoreCASItems(items);
    refreshItemsView();
    alertUser(win, casText.ignoredDone(items.length));
  });
  popup.appendChild(ignore);

  const restore = doc.createXULElement("menuitem");
  restore.setAttribute("label", casText.restore);
  restore.addEventListener("command", () => {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      alertUser(win, text.noSelection);
      return;
    }
    clearCASItemStates(items);
    refreshItemsView();
    alertUser(win, casText.restoredDone(items.length));
  });
  popup.appendChild(restore);
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

  appendCASMenuSection(doc, win, popup);

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

  popup.appendChild(doc.createXULElement("menuseparator"));

  const refreshCAS = doc.createXULElement("menuitem");
  refreshCAS.setAttribute("label", casText.refresh);
  refreshCAS.addEventListener("command", () => void refreshSelectedCASItems(win));
  popup.appendChild(refreshCAS);

  const refreshCASUnknownNone = doc.createXULElement("menuitem");
  refreshCASUnknownNone.setAttribute("label", casText.refreshUnknownNone);
  refreshCASUnknownNone.addEventListener(
    "command",
    () => void refreshSelectedCASUnknownNoneItems(win),
  );
  popup.appendChild(refreshCASUnknownNone);

  const cancelCASRefresh = doc.createXULElement("menuitem");
  cancelCASRefresh.setAttribute("label", casText.cancelRefresh);
  cancelCASRefresh.addEventListener("command", () => cancelActiveCASRefresh(win));
  popup.appendChild(cancelCASRefresh);
  popup.addEventListener("popupshowing", () =>
    updateCASRefreshMenuState(cancelCASRefresh, [
      refreshCAS,
      refreshCASUnknownNone,
    ]),
  );

  toolsPopup.appendChild(root);
}
