import { config } from "../../package.json";
import { cancelBackgroundWarmup } from "./backgroundWarmup";
import {
  cancelInitialization,
  getInitializationProgress,
  getInitializationState,
  getSelectedInitializationItemCount,
  InitializationConfig,
  InitializationMode,
  InitializationOutcome,
  InitializationProgress,
  InitializationScope,
  isInitializationRunning,
  startInitialization,
} from "./initialization";

export const PREFERENCE_PANE_ID = config.addonRef + "-preferences";
const PREFERENCE_PANE_SRC =
  "chrome://" + config.addonRef + "/content/preferences.xhtml";
const PREFERENCE_PANE_STYLESHEET =
  "chrome://" + config.addonRef + "/content/preferences.css";
const PROGRESS_POLL_INTERVAL = 250;

export interface InitializationPreferencesAPI {
  getInitializationState: typeof getInitializationState;
  getInitializationProgress: typeof getInitializationProgress;
  isInitializationRunning: typeof isInitializationRunning;
  startInitialization: (
    config: InitializationConfig,
    contextWindow?: Window,
  ) => Promise<InitializationOutcome>;
  cancelInitialization: typeof cancelInitialization;
  getSelectedInitializationItemCount: typeof getSelectedInitializationItemCount;
  openPreferences: () => Window | null;
}

interface ValueControl extends Element {
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  max?: number;
}

let registeredPreferencePaneID: string | undefined;
let preferencePaneRegistration: Promise<void> | undefined;
const cleanupByWindow = new WeakMap<object, () => void>();

function log(message: string, error?: unknown) {
  if (typeof ztoolkit !== "undefined") ztoolkit.log(message, error);
}

export function getPreferencePaneOptions(): _ZoteroTypes._PreferencePaneOption {
  return {
    pluginID: config.addonID,
    id: PREFERENCE_PANE_ID,
    src: PREFERENCE_PANE_SRC,
    label: "CCF/CAS 分级助手",
    stylesheets: [PREFERENCE_PANE_STYLESHEET],
    defaultXUL: true,
  };
}

export async function registerPreferencesPane(): Promise<void> {
  if (registeredPreferencePaneID || preferencePaneRegistration) {
    return preferencePaneRegistration;
  }

  preferencePaneRegistration = (async () => {
    const preferencePanes = (Zotero as any).PreferencePanes;
    if (!preferencePanes || typeof preferencePanes.register !== "function") {
      log("Zotero PreferencePanes API is unavailable");
      return;
    }

    try {
      const registeredID = await Zotero.PreferencePanes.register(
        getPreferencePaneOptions(),
      );
      registeredPreferencePaneID = String(registeredID || PREFERENCE_PANE_ID);
    } catch (error) {
      log("Could not register CCF/CAS preference pane", error);
    }
  })();

  try {
    await preferencePaneRegistration;
  } finally {
    preferencePaneRegistration = undefined;
  }
}

export function unregisterPreferencesPane(): void {
  if (!registeredPreferencePaneID) return;
  try {
    Zotero.PreferencePanes.unregister(registeredPreferencePaneID);
  } catch (error) {
    log("Could not unregister CCF/CAS preference pane", error);
  } finally {
    registeredPreferencePaneID = undefined;
  }
}

export function openPreferencesPane(): Window | null {
  try {
    const utilities = (Zotero as any).Utilities;
    const internal = utilities?.Internal;
    if (typeof internal?.openPreferences !== "function") {
      log("Zotero openPreferences API is unavailable");
      return null;
    }
    return internal.openPreferences(PREFERENCE_PANE_ID) as Window | null;
  } catch (error) {
    log("Could not open CCF/CAS preference pane", error);
    return null;
  }
}

export function resolveInitializationPreferencesAPI(
  scope: any,
): InitializationPreferencesAPI | undefined {
  const directCandidate = scope?.addon?.api;
  if (directCandidate) {
    return directCandidate as InitializationPreferencesAPI;
  }

  const zoteroCandidate = scope?.Zotero?.[config.addonInstance]?.api;
  return zoteroCandidate as InitializationPreferencesAPI | undefined;
}

function getAddonAPI(): InitializationPreferencesAPI | undefined {
  return resolveInitializationPreferencesAPI(globalThis);
}

function getControl(root: Element, id: string): ValueControl | null {
  return root.querySelector("#" + id) as ValueControl | null;
}

function setControlDisabled(root: Element, id: string, disabled: boolean) {
  const control = getControl(root, id);
  if (!control) return;
  control.disabled = disabled;
  if (disabled) control.setAttribute("disabled", "disabled");
  else control.removeAttribute("disabled");
}

function setText(root: Element, id: string, value: string) {
  const element = getControl(root, id);
  if (element) element.textContent = value;
}

function getControlValue(root: Element, id: string): string {
  const control = getControl(root, id);
  return String(control?.value || "").trim();
}

function isScope(value: string): value is InitializationScope {
  return (
    value === "current-collection" ||
    value === "user-library" ||
    value === "selected-items"
  );
}

function isMode(value: string): value is InitializationMode {
  return (
    value === "incremental" ||
    value === "pending-only" ||
    value === "force-auto"
  );
}

function getChecked(root: Element, id: string): boolean {
  return Boolean(getControl(root, id)?.checked);
}

export function getInitializationScopeLabel(selectedCount: number): string {
  return `主窗口当前选中的文献（${Math.max(0, selectedCount)}）`;
}

export function normalizeInitializationScope(
  scope: InitializationScope,
  selectedCount: number,
): InitializationScope {
  return scope === "selected-items" && selectedCount <= 0
    ? "current-collection"
    : scope;
}

function setElementDisabled(element: ValueControl, disabled: boolean) {
  element.disabled = disabled;
  if (disabled) element.setAttribute("disabled", "disabled");
  else element.removeAttribute("disabled");
}

function syncSelectedItemsScope(
  root: Element,
  api: InitializationPreferencesAPI,
  prefWindow: Window,
) {
  const option = getControl(root, "ccf-init-selected-items-option");
  const scope = getControl(root, "ccf-init-scope");
  if (!option || !scope) return;

  let selectedCount = 0;
  try {
    selectedCount = Math.max(
      0,
      Number(api.getSelectedInitializationItemCount(prefWindow)) || 0,
    );
  } catch (error) {
    log("Could not update selected-items initialization scope", error);
  }

  option.textContent = getInitializationScopeLabel(selectedCount);
  setElementDisabled(option, selectedCount === 0);
  const normalizedScope = normalizeInitializationScope(
    String(scope.value || "current-collection") as InitializationScope,
    selectedCount,
  );
  if (normalizedScope !== scope.value) scope.value = normalizedScope;
}

function readInitializationConfig(root: Element): InitializationConfig | undefined {
  const scopeValue = getControlValue(root, "ccf-init-scope");
  const modeValue = getControlValue(root, "ccf-init-mode");
  const includeCCF = getChecked(root, "ccf-init-ccf");
  const includeCAS = getChecked(root, "ccf-init-cas");
  if (!isScope(scopeValue) || !isMode(modeValue) || (!includeCCF && !includeCAS)) {
    return undefined;
  }
  return {
    scope: scopeValue,
    mode: modeValue,
    includeCCF,
    includeCAS,
  };
}

function applyLastConfiguration(
  root: Element,
  api: InitializationPreferencesAPI,
  prefWindow: Window,
) {
  try {
    syncSelectedItemsScope(root, api, prefWindow);
    const state = api.getInitializationState();
    const selectedCount = api.getSelectedInitializationItemCount(prefWindow);
    if (state.lastScope && isScope(state.lastScope)) {
      const scope = getControl(root, "ccf-init-scope");
      if (scope) {
        scope.value = normalizeInitializationScope(
          state.lastScope,
          selectedCount,
        );
      }
    }
    if (state.lastMode && isMode(state.lastMode)) {
      const mode = getControl(root, "ccf-init-mode");
      if (mode) mode.value = state.lastMode;
    }
    if (state.lastProjects?.length) {
      const ccf = getControl(root, "ccf-init-ccf");
      const cas = getControl(root, "ccf-init-cas");
      if (ccf) ccf.checked = state.lastProjects.includes("CCF");
      if (cas) cas.checked = state.lastProjects.includes("CAS");
    }
  } catch (error) {
    log("Could not restore CCF/CAS initialization settings", error);
  }
}

function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function setProgress(
  root: Element,
  id: string,
  done: number,
  total: number,
) {
  const progress = getControl(root, id);
  if (!progress) return;
  if (total > 0) {
    progress.max = total;
    progress.setAttribute("max", String(total));
    progress.setAttribute("value", String(Math.min(done, total)));
  } else {
    progress.removeAttribute("value");
    progress.setAttribute("max", "1");
  }
}

function formatSummary(progress: InitializationProgress): string {
  const ccf = progress.summary.ccf;
  const cas = progress.summary.cas;
  return (
    "CCF：匹配 " +
    ccf.matched +
    "，None " +
    ccf.none +
    "，Preprint " +
    ccf.preprint +
    "，Unknown " +
    ccf.unknown +
    "；CAS：匹配 " +
    cas.matched +
    "，None " +
    cas.none +
    "，Unknown " +
    cas.unknown +
    "，N/A " +
    cas.notApplicable
  );
}

function formatStatus(progress: InitializationProgress): string {
  switch (progress.status) {
    case "running":
      return "正在初始化";
    case "cancelling":
      return "正在取消";
    case "completed":
      return "初始化完成";
    case "cancelled":
      return "初始化已取消";
    case "error":
      return "初始化失败";
    default:
      return "尚未运行初始化";
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "请查看 Zotero 错误日志。";
}

function renderProgress(
  root: Element,
  api: InitializationPreferencesAPI,
) {
  let progress: InitializationProgress;
  let running = false;
  try {
    progress = api.getInitializationProgress();
    running = api.isInitializationRunning();
  } catch (error) {
    setText(root, "ccf-init-status", "无法读取初始化状态");
    setText(root, "ccf-init-detail", formatError(error));
    return;
  }

  setProgress(
    root,
    "ccf-init-overall-progress",
    progress.overallDone,
    progress.overallTotal,
  );
  setProgress(
    root,
    "ccf-init-stage-progress",
    progress.stageDone,
    progress.stageTotal,
  );
  setText(
    root,
    "ccf-init-overall-value",
    progress.overallTotal > 0
      ? progress.overallDone + "/" + progress.overallTotal + " (" +
        progressPercent(progress.overallDone, progress.overallTotal) + "%)"
      : "准备中",
  );
  setText(root, "ccf-init-stage", progress.stage || "等待开始");
  setText(root, "ccf-init-status", formatStatus(progress));
  setText(root, "ccf-init-detail", progress.detail || "");
  setText(root, "ccf-init-summary", formatSummary(progress));

  const busy =
    running || progress.status === "running" || progress.status === "cancelling";
  setControlDisabled(root, "ccf-init-start", busy);
  setControlDisabled(
    root,
    "ccf-init-cancel",
    !running || progress.status === "cancelling",
  );
}

export function attachInitializationPreferences(
  prefWindow: Window,
  root: Element,
  providedAPI?: InitializationPreferencesAPI,
): () => void {
  cleanupByWindow.get(prefWindow)?.();

  const api = providedAPI || getAddonAPI();
  let timer: any;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timer !== undefined) {
      const clearIntervalFunction =
        (prefWindow as any).clearInterval || globalThis.clearInterval;
      clearIntervalFunction.call(prefWindow, timer);
      timer = undefined;
    }
    getControl(root, "ccf-init-start")?.removeEventListener("command", start);
    getControl(root, "ccf-init-start")?.removeEventListener("click", start);
    getControl(root, "ccf-init-cancel")?.removeEventListener("command", cancel);
    getControl(root, "ccf-init-cancel")?.removeEventListener("click", cancel);
    prefWindow.removeEventListener("unload", cleanup);
    if (cleanupByWindow.get(prefWindow) === cleanup) cleanupByWindow.delete(prefWindow);
  };

  const sync = () => {
    if (!api || cleaned) return;
    syncSelectedItemsScope(root, api, prefWindow);
    renderProgress(root, api);
  };

  const start = () => {
    if (!api || cleaned) return;
    const initializationConfig = readInitializationConfig(root);
    if (!initializationConfig) {
      setText(root, "ccf-init-validation", "请选择处理范围，并至少勾选一个识别项目。");
      return;
    }
    setText(root, "ccf-init-validation", "");
    cancelBackgroundWarmup();
    try {
      void api
        .startInitialization(initializationConfig, prefWindow)
        .then(sync, (error) => {
          setText(root, "ccf-init-status", "初始化失败");
          setText(root, "ccf-init-detail", formatError(error));
          sync();
        });
    } catch (error) {
      setText(root, "ccf-init-status", "初始化失败");
      setText(root, "ccf-init-detail", formatError(error));
    }
    sync();
  };

  const cancel = () => {
    if (!api || cleaned) return;
    api.cancelInitialization();
    sync();
  };

  cleanupByWindow.set(prefWindow, cleanup);
  if (!api) {
    setText(root, "ccf-init-status", "插件接口尚未就绪");
    setText(root, "ccf-init-detail", "请重新打开 Zotero 设置页面。");
    return cleanup;
  }

  applyLastConfiguration(root, api, prefWindow);
  getControl(root, "ccf-init-start")?.addEventListener("command", start);
  getControl(root, "ccf-init-start")?.addEventListener("click", start);
  getControl(root, "ccf-init-cancel")?.addEventListener("command", cancel);
  getControl(root, "ccf-init-cancel")?.addEventListener("click", cancel);
  prefWindow.addEventListener("unload", cleanup);
  sync();

  const setIntervalFunction =
    (prefWindow as any).setInterval || globalThis.setInterval;
  timer = setIntervalFunction.call(prefWindow, sync, PROGRESS_POLL_INTERVAL);
  return cleanup;
}
