import { config } from "../../package.json";
import {
  BasicTool,
  DialogHelper,
  ProgressWindowHelper,
  UITool,
  unregister,
} from "zotero-plugin-toolkit";

class CCFZToolkit extends BasicTool {
  UI: UITool;
  Dialog: typeof DialogHelper;
  ProgressWindow: typeof ProgressWindowHelper;

  constructor() {
    super();
    this.UI = new UITool(this);
    this.Dialog = DialogHelper;
    this.ProgressWindow = ProgressWindowHelper;
  }

  unregisterAll() {
    unregister(this);
  }
}

export function createZToolkit() {
  const toolkit = new CCFZToolkit();
  toolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  toolkit.basicOptions.log.disableConsole = __env__ === "production";
  toolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  toolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  toolkit.basicOptions.api.pluginID = config.addonID;
  return toolkit;
}

