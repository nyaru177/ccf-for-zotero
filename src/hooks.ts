import { registerCASColumn } from "./modules/casColumn";
import { registerCCFColumn } from "./modules/column";
import { shutdownBackgroundWarmup, startBackgroundWarmup } from "./modules/backgroundWarmup";
import { shutdownInitialization } from "./modules/initialization";
import { invalidateCASItemStates } from "./modules/casStorage";
import { registerRightClickMenu, registerToolsMenu } from "./modules/menu";
import { invalidateItemStates } from "./modules/storage";
import {
  attachInitializationPreferences,
  registerPreferencesPane,
  unregisterPreferencesPane,
} from "./modules/preferences";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  await registerPreferencesPane();
  await Promise.all([registerCCFColumn(), registerCASColumn()]);

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
  ztoolkit.log("CCF for Zotero initialized");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  registerRightClickMenu(win);
  registerToolsMenu(win);
  startBackgroundWarmup(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  shutdownInitialization();
  shutdownBackgroundWarmup();
  unregisterPreferencesPane();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error The add-on instance name is configured at build time.
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  if (event !== "modify" || type !== "item" || ids.length === 0) return;
  invalidateItemStates(ids);
  invalidateCASItemStates(ids);
}

async function onPrefsEvent(
  type: string,
  data: { [key: string]: any },
): Promise<void> {
  if (type !== "load") return;
  const prefWindow = data?.window as Window | undefined;
  const root = prefWindow?.document?.getElementById("ccf-init-root");
  if (!prefWindow || !root) {
    ztoolkit.log("Could not find CCF/CAS preference pane root");
    return;
  }
  attachInitializationPreferences(prefWindow, root, addon.api);
}

export default {
  onStartup,
  onShutdown,
  onNotify,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
