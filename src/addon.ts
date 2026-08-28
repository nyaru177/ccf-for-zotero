import { config } from "../package.json";
import hooks from "./hooks";
import {
  cancelInitialization,
  getInitializationProgress,
  getInitializationState,
  getSelectedInitializationItemCount,
  isInitializationRunning,
  startInitialization,
} from "./modules/initialization";
import {
  openPreferencesPane,
  InitializationPreferencesAPI,
} from "./modules/preferences";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized: boolean;
    ztoolkit: ZToolkit;
  };

  public hooks: typeof hooks;
  public api: InitializationPreferencesAPI;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {
      getInitializationState,
      getInitializationProgress,
      isInitializationRunning,
      startInitialization,
      cancelInitialization,
      getSelectedInitializationItemCount,
      openPreferences: openPreferencesPane,
    };
  }
}

export default Addon;
