import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectInitializationItems,
  emptyInitializationProgress,
  getInitializationState,
  getInitializationProgress,
  getSelectedInitializationItemCount,
  isRegularTopLevelItem,
  shouldProcessStoredState,
} from "../src/modules/initialization";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeItem(id: number, options: { parentID?: number; regular?: boolean } = {}) {
  return {
    libraryID: 1,
    id,
    parentID: options.parentID,
    isRegularItem: () => options.regular !== false,
    getField: () => "",
  } as unknown as Zotero.Item;
}

describe("CCF/CAS initialization planning", () => {
  it("keeps only regular top-level items", () => {
    assert.equal(isRegularTopLevelItem(makeItem(1)), true);
    assert.equal(isRegularTopLevelItem(makeItem(2, { parentID: 99 })), false);
    assert.equal(isRegularTopLevelItem(makeItem(3, { regular: false })), false);
  });

  it("collects selected items and removes child or duplicate entries", async () => {
    const originalZotero = (globalThis as any).Zotero;
    const selected = [makeItem(10), makeItem(10), makeItem(11, { parentID: 10 })];
    (globalThis as any).Zotero = {
      getActiveZoteroPane() {
        return { getSelectedItems: () => selected };
      },
    };

    try {
      const result = await collectInitializationItems("selected-items");
      assert.deepEqual(result.map((item) => item.id), [10]);
    } finally {
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("uses the supplied main window for selected items instead of the globally active pane", async () => {
    const originalZotero = (globalThis as any).Zotero;
    const activeItems = [makeItem(99)];
    const mainWindowItems = [makeItem(12), makeItem(13, { parentID: 12 })];
    const mainWindow = {
      ZoteroPane: { getSelectedItems: () => mainWindowItems },
    } as unknown as Window;
    (globalThis as any).Zotero = {
      getActiveZoteroPane() {
        return { getSelectedItems: () => activeItems };
      },
    };

    try {
      const result = await collectInitializationItems("selected-items", mainWindow);
      assert.deepEqual(result.map((item) => item.id), [12]);
      assert.equal(getSelectedInitializationItemCount(mainWindow), 1);
    } finally {
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("collects current collection items and falls back to the current view", async () => {
    const originalZotero = (globalThis as any).Zotero;
    const collectionItems = [makeItem(20), makeItem(21, { parentID: 20 })];
    (globalThis as any).Zotero = {
      getActiveZoteroPane() {
        return {
          getSelectedCollection: () => ({
            getChildItems: () => collectionItems,
          }),
        };
      },
    };

    try {
      const result = await collectInitializationItems("current-collection");
      assert.deepEqual(result.map((item) => item.id), [20]);
    } finally {
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("collects My Library top-level items", async () => {
    const originalZotero = (globalThis as any).Zotero;
    (globalThis as any).Zotero = {
      Libraries: { userLibraryID: 1 },
      Items: {
        async getAll(libraryID: number, onlyTopLevel: boolean) {
          assert.equal(libraryID, 1);
          assert.equal(onlyTopLevel, true);
          return [makeItem(30), makeItem(31, { parentID: 30 })];
        },
      },
    };

    try {
      const result = await collectInitializationItems("user-library");
      assert.deepEqual(result.map((item) => item.id), [30]);
    } finally {
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("does not overwrite manual or ignored states in force mode", () => {
    assert.equal(shouldProcessStoredState(undefined, "incremental"), true);
    assert.equal(shouldProcessStoredState({ source: "auto" }, "incremental"), false);
    assert.equal(shouldProcessStoredState({ source: "manual" }, "incremental"), false);
    assert.equal(shouldProcessStoredState({ source: "manual" }, "force-auto"), false);
    assert.equal(shouldProcessStoredState({ source: "auto" }, "force-auto"), true);
  });

  it("only refreshes pending automatic results in pending-only mode", () => {
    assert.equal(shouldProcessStoredState(undefined, "pending-only"), true);
    assert.equal(shouldProcessStoredState({ source: "auto", status: "unknown" }, "pending-only"), true);
    assert.equal(shouldProcessStoredState({ source: "auto", status: "none" }, "pending-only"), true);
    assert.equal(shouldProcessStoredState({ source: "auto", status: "matched" }, "pending-only"), false);
    assert.equal(shouldProcessStoredState({ source: "manual", status: "none" }, "pending-only"), false);
    assert.equal(shouldProcessStoredState({ source: "manual", status: "ignored" }, "pending-only"), false);
  });

  it("does not treat CAS N/A as a pending result", () => {
    assert.equal(shouldProcessStoredState({ source: "auto", status: "not-applicable" }, "pending-only"), false);
    assert.equal(shouldProcessStoredState({ source: "auto", status: "not-listed" }, "pending-only"), true);
  });

  it("uses the private initialization preference and tolerates invalid data", () => {
    const originalZotero = (globalThis as any).Zotero;
    let raw = JSON.stringify({ hasSeenWizard: true, lastOutcome: "completed" });
    (globalThis as any).Zotero = {
      Prefs: { get: () => raw, set: (_key: string, value: string) => (raw = value) },
    };

    try {
      assert.equal(getInitializationState().hasSeenWizard, true);
      raw = "not-json";
      assert.equal(getInitializationState().hasSeenWizard, false);
    } finally {
      (globalThis as any).Zotero = originalZotero;
    }
  });

  it("exposes an idle progress snapshot without a UI controller", () => {
    const empty = emptyInitializationProgress();
    assert.equal(empty.status, "idle");
    assert.equal(empty.overallDone, 0);
    assert.equal(empty.overallTotal, 0);
    assert.deepEqual(empty.summary.ccf, {
      matched: 0,
      none: 0,
      preprint: 0,
      unknown: 0,
    });

    const snapshot = getInitializationProgress();
    snapshot.summary.ccf.matched = 99;
    assert.equal(getInitializationProgress().summary.ccf.matched, 0);
  });

  it("keeps initialization progress in the plugin runtime", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/initialization.ts"),
      "utf8",
    );

    assert.match(source, /let initializationProgress/);
    assert.match(source, /publishInitializationProgress/);
    assert.match(source, /getInitializationProgress/);
    assert.doesNotMatch(source, /new ztoolkit\.Dialog/);
  });

  it("starts the job before collecting items and supports cancellation checks", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/initialization.ts"),
      "utf8",
    );

    assert.match(source, /export async function startInitialization/);
    assert.match(source, /collectInitializationItems\(config\.scope, win/);
    assert.match(source, /shouldCancel: \(\) =>/);
    assert.match(source, /status: "cancelling"/);
  });

  it("uses a settings-page progress contract instead of a Dialog wizard", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/modules/initialization.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /buildInitializationWizardElementProps/);
    assert.doesNotMatch(source, /buildInitializationProgressHtml/);
    assert.doesNotMatch(source, /createInitializationProgressController/);
    assert.doesNotMatch(source, /openInitializationWizard/);
    assert.doesNotMatch(source, /maybeOpenInitializationWizard/);
    assert.match(source, /getInitializationProgress/);
    assert.match(source, /startInitialization/);
    assert.match(source, /status: \"idle\"/);
  });
});
