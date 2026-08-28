import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getInitializationScopeLabel,
  normalizeInitializationScope,
  resolveInitializationPreferencesAPI,
  getPreferencePaneOptions,
  PREFERENCE_PANE_ID,
} from "../src/modules/preferences";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("CCF/CAS initialization preference pane", () => {
  it("builds a stable Zotero 10 preference pane option", () => {
    const options = getPreferencePaneOptions();
    assert.equal(options.id, PREFERENCE_PANE_ID);
    assert.equal(options.pluginID, "ccf-for-zotero@nyaru177.github.io");
    assert.equal(options.src, "chrome://ccf-for-zotero/content/preferences.xhtml");
    assert.deepEqual(options.stylesheets, [
      "chrome://ccf-for-zotero/content/preferences.css",
    ]);
    assert.equal(options.defaultXUL, true);
  });

  it("contains stable HTML controls for initialization", () => {
    const markup = readFileSync(
      resolve(projectRoot, "addon/content/preferences.xhtml"),
      "utf8",
    );
    assert.match(markup, /ccf-init-scope/);
    assert.match(markup, /ccf-init-ccf/);
    assert.match(markup, /ccf-init-cas/);
    assert.match(markup, /ccf-init-mode/);
    assert.match(markup, /value="pending-only"/);
    assert.match(markup, /ccf-init-start/);
    assert.match(markup, /ccf-init-cancel/);
    assert.match(markup, /onPrefsEvent\('load'/);
    assert.match(markup, /html:input/);
    assert.match(markup, /html:select/);
  });

  it("uses the Zotero-generated pane heading without duplicating it in the document", () => {
    const markup = readFileSync(
      resolve(projectRoot, "addon/content/preferences.xhtml"),
      "utf8",
    );
    assert.doesNotMatch(markup, /class="ccf-title"/);
    assert.equal((markup.match(/CCF\/CAS 分级助手/g) || []).length, 0);
  });

  it("registers plugin icons in the add-on manifest", () => {
    const manifest = readFileSync(
      resolve(projectRoot, "addon/manifest.json"),
      "utf8",
    );
    assert.match(manifest, /"icons"/);
    assert.match(manifest, /content\/icons\/ccf-cas-48\.png/);
    assert.match(manifest, /content\/icons\/ccf-cas-96\.png/);
  });

  it("keeps a compact settings pane root without a duplicate title style", () => {
    const stylesheet = readFileSync(
      resolve(projectRoot, "addon/content/preferences.css"),
      "utf8",
    );
    assert.doesNotMatch(stylesheet, /\.ccf-title/);
    assert.match(stylesheet, /#ccf-init-root\.ccf-preferences/);
  });

  it("keeps the stage label readable when detail text is long", () => {
    const stylesheet = readFileSync(
      resolve(projectRoot, "addon/content/preferences.css"),
      "utf8",
    );
    assert.match(
      stylesheet,
      /#ccf-init-root #ccf-init-stage\s*\{[\s\S]*min-width:\s*max-content/,
    );
    assert.match(
      stylesheet,
      /#ccf-init-root \.ccf-detail\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/,
    );
  });

  it("does not add a missing localization resource to the shared preferences document", () => {
    const markup = readFileSync(
      resolve(projectRoot, "addon/content/preferences.xhtml"),
      "utf8",
    );
    assert.doesNotMatch(markup, /<linkset>/);
    assert.doesNotMatch(markup, /__addonRef__-preferences\.ftl/);
  });

  it("scopes preference styles to the plugin pane root", () => {
    const stylesheet = readFileSync(
      resolve(projectRoot, "addon/content/preferences.css"),
      "utf8",
    );
    for (const selector of [
      ".ccf-section",
      ".ccf-field",
      ".ccf-select",
      ".ccf-check",
      ".ccf-button",
      ".ccf-progress",
    ]) {
      assert.match(
        stylesheet,
        new RegExp(`#ccf-init-root(?:\\.ccf-preferences)?[^{}]*${selector.replace(".", "\\.")}`),
        `expected ${selector} to be scoped to #ccf-init-root`,
      );
    }
  });

  it("registers a Zotero preference pane", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/preferences.ts"),
      "utf8",
    );
    assert.match(source, /Zotero\.PreferencePanes\.register/);
    assert.match(source, /defaultXUL: true/);
    assert.match(source, /preferences\.xhtml/);
    assert.match(source, /preferences\.css/);
    assert.match(source, /attachInitializationPreferences/);
    assert.match(source, /openPreferencesPane/);
  });

  it("keeps the settings controller on the addon API boundary", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/preferences.ts"),
      "utf8",
    );
    assert.match(source, /api\.getInitializationProgress/);
    assert.match(source, /api\s*\.\s*startInitialization/);
    assert.match(source, /api\.cancelInitialization/);
    assert.match(source, /setInterval/);
    assert.match(source, /clearInterval/);
    assert.match(source, /unload/);
  });

  it("opens the settings pane instead of the old wizard", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/menu.ts"),
      "utf8",
    );
    assert.match(source, /openPreferencesPane/);
    assert.doesNotMatch(source, /openInitializationWizard/);
  });

  it("does not auto-open a startup initialization dialog", () => {
    const source = readFileSync(resolve(projectRoot, "src/hooks.ts"), "utf8");
    assert.match(source, /registerPreferencesPane/);
    assert.doesNotMatch(source, /maybeOpenInitializationWizard/);
  });

  it("passes the running plugin API into the preference pane controller", () => {
    const source = readFileSync(resolve(projectRoot, "src/hooks.ts"), "utf8");
    assert.match(
      source,
      /attachInitializationPreferences\(prefWindow, root, addon\.api\)/,
    );
  });

  it("exposes the initialization API from the addon instance", () => {
    const source = readFileSync(resolve(projectRoot, "src/addon.ts"), "utf8");
    assert.match(source, /getInitializationState/);
    assert.match(source, /getInitializationProgress/);
    assert.match(source, /isInitializationRunning/);
    assert.match(source, /startInitialization/);
    assert.match(source, /cancelInitialization/);
    assert.match(source, /openPreferences/);
    assert.match(source, /getSelectedInitializationItemCount/);
  });

  it("resolves the API from the Zotero addon instance when the pane sandbox has no addon global", () => {
    const api = { getInitializationProgress() { return undefined; } };
    const scope = {
      Zotero: { CCFForZotero: { api } },
    };
    assert.equal(resolveInitializationPreferencesAPI(scope), api);
  });

  it("labels and normalizes the selected-items scope using the live selection count", () => {
    assert.equal(getInitializationScopeLabel(3), "主窗口当前选中的文献（3）");
    assert.equal(getInitializationScopeLabel(0), "主窗口当前选中的文献（0）");
    assert.equal(normalizeInitializationScope("selected-items", 3), "selected-items");
    assert.equal(normalizeInitializationScope("selected-items", 0), "current-collection");
  });

  it("keeps a stable id for the selected-items option", () => {
    const markup = readFileSync(
      resolve(projectRoot, "addon/content/preferences.xhtml"),
      "utf8",
    );
    assert.match(markup, /id="ccf-init-selected-items-option"/);
  });
});
