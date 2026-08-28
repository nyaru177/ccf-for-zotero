import { hasBundledCASSnapshot } from "./casCatalog";
import { isInitializationRunning } from "./initialization";
import {
  hasCachedCASState,
  refreshCASItems,
} from "./casService";
import {
  hasCachedRankState,
  refreshItemsRank,
} from "./rankService";
import { getActiveViewIdentity, softRefreshItemsView } from "./viewRefresh";

const STARTUP_WARMUP_LIMIT = 80;
const WARMUP_SAVE_BATCH_SIZE = 25;
const WARMUP_VIEW_REFRESH_EVERY = 25;
const WARMUP_PROGRESS_EVERY = 10;
const WARMUP_VIEW_REFRESH_INTERVAL = 750;

interface BackgroundWarmupJob {
  id: number;
  cancelRequested: boolean;
  generation: number;
  done: number;
  total: number;
  progressWindow?: any;
  viewIdentity: string;
  viewChanged: boolean;
  lastViewRefreshAt: number;
}

let nextWarmupJobID = 1;
let activeWarmupJob: BackgroundWarmupJob | undefined;
let warmupStarted = false;
let warmupGeneration = 0;

function itemKey(item: Zotero.Item): string {
  return String(item.libraryID) + ":" + String(item.id);
}

function isRegularItem(item: any): item is Zotero.Item {
  if (!item) return false;
  try {
    return typeof item.isRegularItem !== "function" || item.isRegularItem();
  } catch {
    return false;
  }
}

function resolveRowItem(row: any): Zotero.Item | undefined {
  const candidates = [row?.ref, row?.item, row?.data?.item, row];
  for (const candidate of candidates) {
    if (isRegularItem(candidate)) return candidate;
  }

  const ids = [row?.id, row?.ref?.id, row?.itemID, row?.ref?.itemID];
  for (const id of ids) {
    if (typeof id !== "number") continue;
    try {
      const item = Zotero.Items.get(id);
      if (isRegularItem(item)) return item;
    } catch {
      // A row can disappear while the collection is being reloaded.
    }
  }

  return undefined;
}

function collectWarmupItems(limit = STARTUP_WARMUP_LIMIT): Zotero.Item[] {
  const pane = Zotero.getActiveZoteroPane?.();
  const items: Zotero.Item[] = [];
  const seen = new Set<string>();

  const add = (item: unknown) => {
    if (!isRegularItem(item)) return;
    const key = itemKey(item);
    if (seen.has(key) || items.length >= limit) return;
    seen.add(key);
    items.push(item);
  };

  try {
    for (const item of pane?.getSelectedItems?.() || []) add(item);
  } catch {
    // Selection may not be ready during the first window load.
  }

  const itemsView = pane?.itemsView as any;
  try {
    const rowCount = Math.min(Number(itemsView?.rowCount) || 0, limit);
    for (let index = 0; index < rowCount && items.length < limit; index++) {
      add(resolveRowItem(itemsView.getRow(index)));
    }
  } catch {
    // Fall back to the stable pane API below when row access is unavailable.
  }

  if (items.length < limit) {
    try {
      for (const item of pane?.getSortedItems?.() || []) {
        add(item);
        if (items.length >= limit) break;
      }
    } catch {
      // The item tree can still be mounting at this point.
    }
  }

  return items;
}

function delay(win: Window, milliseconds = 0): Promise<void> {
  return new Promise((resolve) => {
    const setTimeoutFromWindow = (win as any).setTimeout;
    if (setTimeoutFromWindow) {
      setTimeoutFromWindow.call(win, resolve, milliseconds);
    } else {
      setTimeout(resolve, milliseconds);
    }
  });
}

function getItemTitle(item: Zotero.Item): string {
  try {
    const title = item.getField("title");
    if (title) return String(title).slice(0, 42);
  } catch {
    // Use the item id when a row is being unloaded.
  }
  return "条目 " + String(item.id);
}

function createProgressWindow(win: Window, total: number) {
  try {
    return new ztoolkit.ProgressWindow("CCF/CAS 后台准备", {
      window: win,
      closeOnClick: false,
      closeOtherProgressWindows: false,
    })
      .createLine({
        text: "准备 " + String(total) + " 个条目",
        progress: 0,
      })
      .show(-1);
  } catch (error) {
    ztoolkit.log("Could not open CCF/CAS warmup progress window", error);
    return undefined;
  }
}

function updateProgress(
  job: BackgroundWarmupJob,
  done: number,
  total: number,
  item?: Zotero.Item,
) {
  if (!job.progressWindow) return;
  try {
    const title = item ? "：" + getItemTitle(item) : "";
    job.progressWindow.changeLine({
      text: job.cancelRequested
        ? "正在取消后台准备..."
        : "准备 " + String(done) + "/" + String(total) + title,
      progress: total ? Math.round((done / total) * 100) : 100,
    });
  } catch (error) {
    ztoolkit.log("Could not update CCF/CAS warmup progress window", error);
  }
}

function closeProgress(job: BackgroundWarmupJob, done: number, total: number) {
  if (!job.progressWindow) return;
  try {
    job.progressWindow.changeLine({
      type: job.cancelRequested ? "default" : "success",
      text: job.cancelRequested
        ? "后台准备已取消 " + String(done) + "/" + String(total)
        : "后台准备完成 " + String(done) + "/" + String(total),
      progress: total ? Math.round((done / total) * 100) : 100,
    });
    job.progressWindow.startCloseTimer(job.cancelRequested ? 2500 : 1200);
  } catch (error) {
    ztoolkit.log("Could not close CCF/CAS warmup progress window", error);
  }
}

function isCurrentJob(job: BackgroundWarmupJob): boolean {
  return (
    activeWarmupJob?.id === job.id &&
    job.generation === warmupGeneration &&
    !job.cancelRequested
  );
}

function isAttachedJob(job: BackgroundWarmupJob): boolean {
  return (
    activeWarmupJob?.id === job.id &&
    job.generation === warmupGeneration
  );
}

function refreshWarmupView(items: Zotero.Item[]) {
  if (items.length === 0) return;
  softRefreshItemsView(items);
}

async function runWarmup(win: Window, job: BackgroundWarmupJob) {
  if (!isCurrentJob(job)) return;
  if (isInitializationRunning()) return;
  const candidates = collectWarmupItems();
  const ccfItems = candidates.filter((item) => !hasCachedRankState(item));
  const casItems = hasBundledCASSnapshot()
    ? candidates.filter((item) => !hasCachedCASState(item))
    : [];
  const total = ccfItems.length + casItems.length;
  job.total = total;

  if (total === 0) return;

  job.progressWindow = createProgressWindow(win, total);
  let done = 0;
  let changedItems: Zotero.Item[] = [];

  const onItemDone = async (item: Zotero.Item) => {
    done += 1;
    job.done = done;
    changedItems.push(item);
    if (getActiveViewIdentity() !== job.viewIdentity) {
      job.viewChanged = true;
      job.cancelRequested = true;
      return;
    }
    if (changedItems.length >= WARMUP_VIEW_REFRESH_EVERY && isCurrentJob(job)) {
      refreshWarmupView(changedItems);
      changedItems = [];
    }
    if (
      Date.now() - job.lastViewRefreshAt >= WARMUP_VIEW_REFRESH_INTERVAL &&
      isCurrentJob(job)
    ) {
      refreshWarmupView(changedItems);
      job.lastViewRefreshAt = Date.now();
      changedItems = [];
    }
    if (
      isCurrentJob(job) &&
      (done === 1 || done === total || done % WARMUP_PROGRESS_EVERY === 0)
    ) {
      updateProgress(job, done, total, item);
    }
    await delay(win, 0);
  };

  if (ccfItems.length > 0 && isCurrentJob(job)) {
    await refreshItemsRank(ccfItems, {
      saveBatchSize: WARMUP_SAVE_BATCH_SIZE,
      shouldCancel: () => job.cancelRequested,
      onProgress: async (_done, _total, item) => onItemDone(item),
    });
  }

  if (casItems.length > 0 && isCurrentJob(job)) {
    await refreshCASItems(casItems, {
      saveBatchSize: WARMUP_SAVE_BATCH_SIZE,
      shouldCancel: () => job.cancelRequested,
      onProgress: async (_done, _total, item) => onItemDone(item),
    });
  }

  if (isAttachedJob(job)) {
    if (!job.cancelRequested && changedItems.length > 0) {
      refreshWarmupView(changedItems);
    }
    closeProgress(job, done, total);
  }
}

export function isBackgroundWarmupRunning(): boolean {
  return Boolean(activeWarmupJob);
}

export function cancelBackgroundWarmup(): boolean {
  if (!activeWarmupJob) return false;
  activeWarmupJob.cancelRequested = true;
  updateProgress(
    activeWarmupJob,
    activeWarmupJob.done,
    activeWarmupJob.total,
  );
  return true;
}

export function startBackgroundWarmup(win: Window) {
  if (warmupStarted || activeWarmupJob || isInitializationRunning()) return;
  warmupStarted = true;
  const generation = ++warmupGeneration;

  void delay(win, 350).then(async () => {
    if (!warmupStarted || generation !== warmupGeneration) return;
    const job: BackgroundWarmupJob = {
      id: nextWarmupJobID++,
      cancelRequested: false,
      generation,
      done: 0,
      total: 0,
      viewIdentity: getActiveViewIdentity(),
      viewChanged: false,
      lastViewRefreshAt: Date.now(),
    };
    activeWarmupJob = job;
    try {
      await runWarmup(win, job);
    } catch (error) {
      ztoolkit.log("CCF/CAS background warmup failed", error);
    } finally {
      if (activeWarmupJob?.id === job.id) activeWarmupJob = undefined;
    }
  });
}

export function shutdownBackgroundWarmup() {
  warmupStarted = false;
  warmupGeneration += 1;
  cancelBackgroundWarmup();
  activeWarmupJob = undefined;
}
