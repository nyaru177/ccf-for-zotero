import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invalidateItemRows,
  refreshItemsViewAndMaintainSelection,
  softRefreshItemsView,
} from "../src/modules/viewRefresh";

function withZoteroItemsView(itemsView: any, callback: () => void) {
  const originalZotero = (globalThis as any).Zotero;
  const originalZtoolkit = (globalThis as any).ztoolkit;
  (globalThis as any).Zotero = {
    getActiveZoteroPane() {
      return { itemsView };
    },
  };
  (globalThis as any).ztoolkit = { log() {} };
  try {
    callback();
  } finally {
    (globalThis as any).Zotero = originalZotero;
    (globalThis as any).ztoolkit = originalZtoolkit;
  }
}

describe("Zotero item view refresh helpers", () => {
  it("invalidates specific rows for small target sets", () => {
    const invalidatedRows: number[] = [];
    const itemsView = {
      getRowIndexByID(id: string | number) {
        return String(id) === "42" ? 3 : false;
      },
      tree: {
        invalidateRow(rowIndex: number) {
          invalidatedRows.push(rowIndex);
        },
      },
    };

    withZoteroItemsView(itemsView, () => {
      assert.equal(invalidateItemRows([42]), true);
      assert.deepEqual(invalidatedRows, [3]);
    });
  });

  it("uses visible-row invalidation for large target sets", () => {
    const invalidatedRows: number[] = [];
    let directLookups = 0;
    const targets = Array.from({ length: 500 }, (_, index) => index + 1);
    const visibleRows = [{ id: 101 }, { id: 250 }, { id: 999 }];
    const itemsView = {
      getRow(index: number) {
        return visibleRows[index];
      },
      getRowIndexByID() {
        directLookups += 1;
        return false;
      },
      tree: {
        getFirstVisibleRow() {
          return 0;
        },
        getLastVisibleRow() {
          return visibleRows.length - 1;
        },
        invalidateRow(rowIndex: number) {
          invalidatedRows.push(rowIndex);
        },
        invalidate() {
          throw new Error("visible rows should be enough");
        },
      },
    };

    withZoteroItemsView(itemsView, () => {
      assert.equal(softRefreshItemsView(targets), true);
      assert.deepEqual(invalidatedRows, [0, 1]);
      assert.equal(directLookups, 0);
    });
  });

  it("keeps full refresh as an explicit empty-target fallback", () => {
    let refreshCalls = 0;
    const itemsView = {
      refreshAndMaintainSelection() {
        refreshCalls += 1;
      },
      tree: {
        invalidate() {
          throw new Error("should prefer refreshAndMaintainSelection");
        },
      },
    };

    withZoteroItemsView(itemsView, () => {
      assert.equal(refreshItemsViewAndMaintainSelection(), true);
      assert.equal(refreshCalls, 1);
    });
  });
});
