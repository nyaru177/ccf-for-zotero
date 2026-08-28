import {
  ensureCASCatalog,
  getCASCatalogVersion,
  hasBundledCASSnapshot,
} from "./casCatalog";
import { getStoredCASState } from "./casStorage";
import { CASMatchResult } from "./casTypes";
import { refreshCASItems } from "./casService";
import { getStoredState } from "./storage";
import { MatchResult } from "./types";
import { refreshItemsRank } from "./rankService";
import { softRefreshItemsView } from "./viewRefresh";

export type InitializationScope =
  | "current-collection"
  | "user-library"
  | "selected-items";
export type InitializationMode =
  | "incremental"
  | "pending-only"
  | "force-auto";

export interface InitializationConfig {
  scope: InitializationScope;
  includeCCF: boolean;
  includeCAS: boolean;
  mode: InitializationMode;
}

export interface InitializationState {
  version: 1;
  hasSeenWizard: boolean;
  lastRunAt?: string;
  lastScope?: InitializationScope;
  lastMode?: InitializationMode;
  lastProjects?: string[];
  lastOutcome?: "completed" | "cancelled";
}

export interface InitializationSummary {
  ccf: { matched: number; none: number; preprint: number; unknown: number };
  cas: { matched: number; none: number; unknown: number; notApplicable: number };
}

export type InitializationOutcome = "deferred" | "completed" | "cancelled";
export type InitializationProgressStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "error";

export interface InitializationProgress {
  status: InitializationProgressStatus;
  overallDone: number;
  overallTotal: number;
  stage: string;
  stageDone: number;
  stageTotal: number;
  detail: string;
  summary: InitializationSummary;
  updatedAt?: string;
}

export interface CollectInitializationItemsOptions {
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

const INITIALIZATION_STATE_KEY =
  "extensions.ccf-for-zotero.initializationState";
const INITIALIZATION_STATE_VERSION = 1 as const;
const VIEW_REFRESH_INTERVAL = 750;
const YIELD_EVERY = 25;
const COLLECTION_YIELD_EVERY = 100;

let activeInitializationJob: InitializationJob | undefined;
let activeInitializationPromise: Promise<InitializationOutcome> | undefined;
let initializationGeneration = 0;

interface InitializationJob {
  id: number;
  generation: number;
  cancelRequested: boolean;
  lastViewRefreshAt: number;
}

let nextInitializationJobID = 1;

function log(message: string, error?: unknown) {
  if (typeof ztoolkit !== "undefined") ztoolkit.log(message, error);
}

function emptyInitializationState(): InitializationState {
  return { version: INITIALIZATION_STATE_VERSION, hasSeenWizard: false };
}

export function getInitializationState(): InitializationState {
  let raw = "";
  try {
    raw = String(Zotero.Prefs.get(INITIALIZATION_STATE_KEY, true) || "");
  } catch (error) {
    log("Could not read CCF/CAS initialization state", error);
  }
  if (!raw) return emptyInitializationState();

  try {
    const parsed = JSON.parse(raw) as Partial<InitializationState>;
    return {
      ...emptyInitializationState(),
      ...parsed,
      version: INITIALIZATION_STATE_VERSION,
      hasSeenWizard: Boolean(parsed.hasSeenWizard),
    };
  } catch (error) {
    log("Could not parse CCF/CAS initialization state", error);
    return emptyInitializationState();
  }
}

function saveInitializationState(state: InitializationState) {
  try {
    Zotero.Prefs.set(INITIALIZATION_STATE_KEY, JSON.stringify(state), true);
  } catch (error) {
    log("Could not save CCF/CAS initialization state", error);
  }
}

export function isInitializationRunning(): boolean {
  return Boolean(activeInitializationJob || activeInitializationPromise);
}

export function cancelInitialization(): boolean {
  if (!activeInitializationJob && !activeInitializationPromise) return false;
  if (activeInitializationJob) activeInitializationJob.cancelRequested = true;
  publishInitializationProgress({
    status: "cancelling",
    detail: "正在取消，将保存已经完成的批次...",
  });
  return true;
}

export function shutdownInitialization() {
  initializationGeneration += 1;
  if (activeInitializationJob) activeInitializationJob.cancelRequested = true;
  activeInitializationJob = undefined;
  activeInitializationPromise = undefined;
}

function itemKey(item: any): string {
  return String(item?.libraryID || "") + ":" + String(item?.id || "");
}

export function isRegularTopLevelItem(item: any): item is Zotero.Item {
  if (!item) return false;
  try {
    if (typeof item.isRegularItem === "function" && !item.isRegularItem()) {
      return false;
    }
  } catch {
    return false;
  }

  const parentID = item.parentID ?? item.parentItemID;
  return !parentID;
}

function delay(win: Window | undefined, milliseconds = 0): Promise<void> {
  return new Promise((resolve) => {
    const setTimeoutFromWindow = (win as any)?.setTimeout;
    if (setTimeoutFromWindow) {
      setTimeoutFromWindow.call(win, resolve, milliseconds);
    } else {
      setTimeout(resolve, milliseconds);
    }
  });
}

function addItems(target: Zotero.Item[], seen: Set<string>, values: unknown[]) {
  for (const value of values || []) {
    if (!isRegularTopLevelItem(value)) continue;
    const key = itemKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(value);
  }
}

async function addItemsWithProgress(
  target: Zotero.Item[],
  seen: Set<string>,
  values: unknown,
  win: Window | undefined,
  options: CollectInitializationItemsOptions,
): Promise<boolean> {
  const list = Array.isArray(values) ? values : [];
  for (let index = 0; index < list.length; index++) {
    if (options.shouldCancel?.()) return false;
    addItems(target, seen, [list[index]]);
    options.onProgress?.(index + 1, list.length);
    if ((index + 1) % COLLECTION_YIELD_EVERY === 0) {
      await delay(win, 0);
    }
  }
  return true;
}

async function collectCurrentViewItems(
  win?: Window,
  options: CollectInitializationItemsOptions = {},
): Promise<Zotero.Item[]> {
  const pane = getMainPane(win);
  const items: Zotero.Item[] = [];
  const seen = new Set<string>();

  try {
    await addItemsWithProgress(
      items,
      seen,
      pane?.getSortedItems?.() || [],
      win,
      options,
    );
  } catch (error) {
    log("Could not collect current Zotero item view", error);
  }
  return items;
}

export async function collectInitializationItems(
  scope: InitializationScope,
  win?: Window,
  options: CollectInitializationItemsOptions = {},
): Promise<Zotero.Item[]> {
  const pane = getMainPane(win);
  const items: Zotero.Item[] = [];
  const seen = new Set<string>();

  if (scope === "selected-items") {
    try {
      await addItemsWithProgress(
        items,
        seen,
        pane?.getSelectedItems?.() || [],
        win,
        options,
      );
    } catch (error) {
      log("Could not collect selected Zotero items", error);
    }
    return items;
  }

  if (scope === "current-collection") {
    try {
      const collection = pane?.getSelectedCollection?.();
      if (collection) {
        await addItemsWithProgress(
          items,
          seen,
          collection.getChildItems(false, false) || [],
          win,
          options,
        );
        return items;
      }
    } catch (error) {
      log("Could not collect current Zotero collection", error);
    }
    return collectCurrentViewItems(win, options);
  }

  try {
    const libraryID = Number(Zotero.Libraries.userLibraryID);
    const values = await Zotero.Items.getAll(libraryID, true, false, false);
    await addItemsWithProgress(items, seen, values, win, options);
  } catch (error) {
    log("Could not collect all items from My Library", error);
  }
  return items;
}

export function getSelectedInitializationItemCount(win?: Window): number {
  try {
    const selectedItems = getMainPane(win)?.getSelectedItems?.() || [];
    return selectedItems.filter((item: unknown) =>
      isRegularTopLevelItem(item),
    ).length;
  } catch (error) {
    log("Could not count selected Zotero items", error);
    return 0;
  }
}

export function shouldProcessStoredState(
  state: { source?: string; status?: string } | undefined,
  mode: InitializationMode,
): boolean {
  if (mode === "force-auto") return !state || state.source !== "manual";
  if (mode === "pending-only") {
    if (!state || state.source === "manual") return !state;
    return (
      state.status === "unknown" ||
      state.status === "none" ||
      state.status === "not-listed"
    );
  }
  return !state;
}

async function filterItemsForInitialization<T>(
  items: Zotero.Item[],
  mode: InitializationMode,
  getState: (item: Zotero.Item) => T | undefined,
  job: InitializationJob,
  onProgress: (done: number, total: number, item: Zotero.Item) => void,
  win?: Window,
): Promise<{ items: Zotero.Item[]; cancelled: boolean }> {
  const result: Zotero.Item[] = [];
  for (let index = 0; index < items.length; index++) {
    if (isJobCancelled(job)) return { items: result, cancelled: true };
    const item = items[index];
    if (shouldProcessStoredState(getState(item) as any, mode)) result.push(item);
    onProgress(index + 1, items.length, item);
    if ((index + 1) % YIELD_EVERY === 0) await delay(win, 0);
  }
  return { items: result, cancelled: false };
}

function itemTitle(item: Zotero.Item): string {
  try {
    const title = String(item.getField("title") || "").trim();
    if (title) return title.length > 48 ? title.slice(0, 47) + "..." : title;
  } catch {
    // The item can disappear while a collection is being reloaded.
  }
  return "条目 " + String(item.id);
}

function newSummary(): InitializationSummary {
  return {
    ccf: { matched: 0, none: 0, preprint: 0, unknown: 0 },
    cas: { matched: 0, none: 0, unknown: 0, notApplicable: 0 },
  };
}

export function emptyInitializationProgress(): InitializationProgress {
  return {
    status: "idle",
    overallDone: 0,
    overallTotal: 0,
    stage: "",
    stageDone: 0,
    stageTotal: 0,
    detail: "",
    summary: newSummary(),
  };
}

let initializationProgress = emptyInitializationProgress();

function copySummary(summary: InitializationSummary): InitializationSummary {
  return {
    ccf: { ...summary.ccf },
    cas: { ...summary.cas },
  };
}

export function getInitializationProgress(): InitializationProgress {
  return {
    ...initializationProgress,
    summary: copySummary(initializationProgress.summary),
  };
}

function publishInitializationProgress(
  update: Partial<Omit<InitializationProgress, "summary" | "updatedAt">> & {
    summary?: InitializationSummary;
  },
) {
  initializationProgress = {
    ...initializationProgress,
    ...update,
    summary: copySummary(update.summary || initializationProgress.summary),
    updatedAt: new Date().toISOString(),
  };
}

function finishInitializationProgress(
  status: Extract<InitializationProgressStatus, "completed" | "cancelled" | "error">,
  detail: string,
  summary?: InitializationSummary,
) {
  publishInitializationProgress({ status, detail, summary });
}

function countCCFResult(summary: InitializationSummary, result: MatchResult) {
  if (result.status === "matched") summary.ccf.matched += 1;
  if (result.status === "none") summary.ccf.none += 1;
  if (result.status === "preprint") summary.ccf.preprint += 1;
  if (result.status === "unknown") summary.ccf.unknown += 1;
}

function countCASResult(summary: InitializationSummary, result: CASMatchResult) {
  if (result.status === "matched") summary.cas.matched += 1;
  if (result.status === "not-listed") summary.cas.none += 1;
  if (result.status === "unknown") summary.cas.unknown += 1;
  if (result.status === "not-applicable") summary.cas.notApplicable += 1;
}

function summaryText(summary: InitializationSummary): string {
  return (
    "CCF 匹配 " +
    summary.ccf.matched +
    " / None " +
    summary.ccf.none +
    " / Unknown " +
    summary.ccf.unknown +
    "；CAS 匹配 " +
    summary.cas.matched +
    " / None " +
    summary.cas.none +
    " / Unknown " +
    summary.cas.unknown +
    " / N/A " +
    summary.cas.notApplicable
  );
}

function isJobCancelled(job: InitializationJob): boolean {
  return job.cancelRequested || job.generation !== initializationGeneration;
}

function maybeRefreshView(job: InitializationJob, items: Zotero.Item[]) {
  const now = Date.now();
  if (now - job.lastViewRefreshAt < VIEW_REFRESH_INTERVAL) return;
  job.lastViewRefreshAt = now;
  softRefreshItemsView(items);
}

function getPaneFromWindow(win: Window | undefined): any | undefined {
  if (!win) return undefined;
  const candidate = win as any;
  return candidate.ZoteroPane || candidate.ZoteroPane_Local;
}

export function getMainPane(preferred?: Window): any | undefined {
  const relatedWindows = [
    preferred,
    (preferred as any)?.opener as Window | undefined,
  ];
  for (const win of relatedWindows) {
    const pane = getPaneFromWindow(win);
    if (pane) return pane;
  }

  try {
    const activePane = Zotero.getActiveZoteroPane?.() as any;
    if (activePane) return activePane;
  } catch {
    // The main pane can be unavailable while Zotero switches windows.
  }

  try {
    for (const win of Zotero.getMainWindows?.() || []) {
      const pane = getPaneFromWindow(win as Window);
      if (pane) return pane;
    }
  } catch {
    // Main windows are not available during Zotero startup/shutdown.
  }

  return undefined;
}

function getMainWindow(preferred?: Window): Window | undefined {
  for (const win of [
    preferred,
    (preferred as any)?.opener as Window | undefined,
  ]) {
    if (getPaneFromWindow(win)) return win;
  }

  try {
    const activePane = Zotero.getActiveZoteroPane?.() as any;
    const activeWindow = activePane?.document?.defaultView as Window | undefined;
    if (activeWindow) return activeWindow;
  } catch {
    // The main pane can be unavailable while Zotero switches windows.
  }

  try {
    return Zotero.getMainWindows?.()[0] as Window | undefined;
  } catch {
    return undefined;
  }
}

function validateInitializationConfig(config: InitializationConfig) {
  if (
    !config ||
    !config.scope ||
    !config.mode ||
    (!config.includeCCF && !config.includeCAS)
  ) {
    throw new Error("请至少选择一个识别项目，并确认处理范围。");
  }
}

async function runInitialization(
  win: Window | undefined,
  config: InitializationConfig,
  job: InitializationJob,
): Promise<InitializationOutcome> {
  const summary = newSummary();
  const selectedProjects = [
    ...(config.includeCCF ? ["CCF"] : []),
    ...(config.includeCAS ? ["CAS"] : []),
  ];
  let items: Zotero.Item[] = [];
  let ccfItems: Zotero.Item[] = [];
  let casItems: Zotero.Item[] = [];
  let overallDone = 0;
  let overallTotal = 0;

  const finish = (outcome: InitializationOutcome): InitializationOutcome => {
    softRefreshItemsView([...ccfItems, ...casItems]);
    const state = getInitializationState();
    saveInitializationState({
      ...state,
      hasSeenWizard: true,
      lastRunAt: new Date().toISOString(),
      lastScope: config.scope,
      lastMode: config.mode,
      lastProjects: selectedProjects,
      lastOutcome: outcome === "completed" ? "completed" : "cancelled",
    });
    finishInitializationProgress(
      outcome === "completed" ? "completed" : "cancelled",
      (outcome === "completed" ? "初始化完成。" : "初始化已取消。") +
        " " +
        summaryText(summary),
      summary,
    );
    return outcome;
  };

  try {
    publishInitializationProgress({
      status: "running",
      overallDone: 0,
      overallTotal: 0,
      stage: "收集条目",
      stageDone: 0,
      stageTotal: 0,
      detail: "正在收集普通顶层条目...",
      summary,
    });

    items = await collectInitializationItems(config.scope, win, {
      shouldCancel: () => isJobCancelled(job),
      onProgress: (done, total) => {
        publishInitializationProgress({
          status: isJobCancelled(job) ? "cancelling" : "running",
          stage: "收集条目",
          stageDone: done,
          stageTotal: total,
          detail: "正在收集普通顶层条目 " + done + "/" + total + "...",
        });
      },
    });

    if (isJobCancelled(job)) return finish("cancelled");

    publishInitializationProgress({
      status: "running",
      stage: "检查缓存",
      stageDone: 0,
      stageTotal: items.length,
      detail: "已收集 " + items.length + " 个普通顶层条目。",
    });

    if (config.includeCCF) {
      const filtered = await filterItemsForInitialization(
        items,
        config.mode,
        (item) => getStoredState(item, { validateInputFingerprint: true }),
        job,
        (done, total, item) => {
          if (done === 1 || done === total || done % YIELD_EVERY === 0) {
            publishInitializationProgress({
              status: isJobCancelled(job) ? "cancelling" : "running",
              stage: "CCF 检查缓存",
              stageDone: done,
              stageTotal: total,
              detail: "已检查 " + done + "/" + total + "；当前：" + itemTitle(item),
            });
          }
        },
        win,
      );
      ccfItems = filtered.items;
      if (filtered.cancelled) job.cancelRequested = true;
    }

    if (config.includeCAS && !isJobCancelled(job)) {
      if (!hasBundledCASSnapshot()) {
        publishInitializationProgress({
          status: "running",
          stage: "CAS",
          stageDone: 0,
          stageTotal: 0,
          detail: "当前版本没有可用的内置 CAS 数据，已跳过 CAS。",
        });
      } else {
        publishInitializationProgress({
          status: "running",
          stage: "CAS 准备",
          stageDone: 0,
          stageTotal: 0,
          detail: "正在准备内置 CAS 数据...",
        });
        await ensureCASCatalog();
        if (isJobCancelled(job)) return finish("cancelled");

        const filtered = await filterItemsForInitialization(
          items,
          config.mode,
          (item) =>
            getStoredCASState(item, getCASCatalogVersion(), {
              validateInputFingerprint: true,
            }),
          job,
          (done, total, item) => {
            if (done === 1 || done === total || done % YIELD_EVERY === 0) {
              publishInitializationProgress({
                status: isJobCancelled(job) ? "cancelling" : "running",
                stage: "CAS 检查缓存",
                stageDone: done,
                stageTotal: total,
                detail: "已检查 " + done + "/" + total + "；当前：" + itemTitle(item),
              });
            }
          },
          win,
        );
        casItems = filtered.items;
        if (filtered.cancelled) job.cancelRequested = true;
      }
    }

    if (isJobCancelled(job)) return finish("cancelled");

    overallTotal = ccfItems.length + casItems.length;
    publishInitializationProgress({
      status: "running",
      overallDone,
      overallTotal,
      stage: "准备识别",
      stageDone: 0,
      stageTotal: overallTotal,
      detail:
        overallTotal > 0
          ? "待识别 " + overallTotal + " 个条目。"
          : "没有需要重新识别的条目。",
    });

    if (ccfItems.length > 0) {
      const result = await refreshItemsRank(ccfItems, {
        saveBatchSize: 500,
        shouldCancel: () => isJobCancelled(job),
        onProgress: async (done, total, item, matchResult) => {
          countCCFResult(summary, matchResult);
          overallDone += 1;
          publishInitializationProgress({
            status: isJobCancelled(job) ? "cancelling" : "running",
            overallDone,
            overallTotal,
            stage: "CCF 识别",
            stageDone: done,
            stageTotal: total,
            detail: summaryText(summary) + "；当前：" + itemTitle(item),
            summary,
          });
          maybeRefreshView(job, [item]);
          if (done % YIELD_EVERY === 0) await delay(win, 0);
        },
      });
      if (result.cancelled) job.cancelRequested = true;
    }

    if (casItems.length > 0 && !isJobCancelled(job)) {
      const result = await refreshCASItems(casItems, {
        saveBatchSize: 500,
        shouldCancel: () => isJobCancelled(job),
        onProgress: async (done, total, item, matchResult) => {
          countCASResult(summary, matchResult);
          overallDone += 1;
          publishInitializationProgress({
            status: isJobCancelled(job) ? "cancelling" : "running",
            overallDone,
            overallTotal,
            stage: "CAS 识别",
            stageDone: done,
            stageTotal: total,
            detail: summaryText(summary) + "；当前：" + itemTitle(item),
            summary,
          });
          maybeRefreshView(job, [item]);
          if (done % YIELD_EVERY === 0) await delay(win, 0);
        },
      });
      if (result.cancelled) job.cancelRequested = true;
    }

    return finish(isJobCancelled(job) ? "cancelled" : "completed");
  } catch (error) {
    job.cancelRequested = true;
    log("CCF/CAS initialization failed", error);
    softRefreshItemsView([...ccfItems, ...casItems]);
    finishInitializationProgress(
      "error",
      "初始化失败，已经完成的批次已保留。",
      summary,
    );
    return "cancelled";
  } finally {
    if (activeInitializationJob?.id === job.id) {
      activeInitializationJob = undefined;
    }
    if (activeInitializationPromise && activeInitializationJob === undefined) {
      activeInitializationPromise = undefined;
    }
  }
}

export async function startInitialization(
  config: InitializationConfig,
  win?: Window,
): Promise<InitializationOutcome> {
  validateInitializationConfig(config);
  if (activeInitializationPromise) return activeInitializationPromise;

  const job: InitializationJob = {
    id: nextInitializationJobID++,
    generation: initializationGeneration,
    cancelRequested: false,
    lastViewRefreshAt: 0,
  };
  activeInitializationJob = job;
  publishInitializationProgress({
    status: "running",
    overallDone: 0,
    overallTotal: 0,
    stage: "准备中",
    stageDone: 0,
    stageTotal: 0,
    detail: "正在启动初始化...",
    summary: newSummary(),
  });

  const promise = runInitialization(getMainWindow(win), config, job);
  activeInitializationPromise = promise;
  return promise;
}
