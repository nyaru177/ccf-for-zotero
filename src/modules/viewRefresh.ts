type RefreshTarget = Zotero.Item | string | number | undefined | null;

const MAX_DIRECT_ROW_LOOKUPS = 250;

function callViewMethod(target: any, method: string): boolean {
  if (typeof target?.[method] !== "function") return false;
  try {
    target[method]();
    return true;
  } catch (error) {
    ztoolkit.log(`Could not refresh Zotero item view via ${method}`, error);
    return false;
  }
}

function getTargetItemID(target: RefreshTarget): string | undefined {
  if (target === undefined || target === null) return undefined;
  if (typeof target === "string" || typeof target === "number") {
    return String(target);
  }
  if (typeof (target as Zotero.Item).id === "number") {
    return String((target as Zotero.Item).id);
  }
  return undefined;
}

function getRowIndexByItemID(itemsView: any, itemID: string): number | undefined {
  if (typeof itemsView?.getRowIndexByID !== "function") return undefined;
  for (const value of [itemID, Number(itemID)]) {
    if (value === "" || (typeof value === "number" && !Number.isFinite(value))) {
      continue;
    }
    try {
      const rowIndex = itemsView.getRowIndexByID(value);
      if (
        rowIndex !== false &&
        rowIndex !== undefined &&
        rowIndex !== null &&
        Number(rowIndex) >= 0
      ) {
        return Number(rowIndex);
      }
    } catch {
      // Zotero builds differ on whether item IDs are strings or numbers.
    }
  }
  return undefined;
}

function getRowItemID(row: any): string | undefined {
  const candidates = [
    row?.ref?.id,
    row?.item?.id,
    row?.data?.item?.id,
    row?.id,
    row?.itemID,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return String(candidate);
    }
  }
  return undefined;
}

function invalidateVisibleRowsByID(
  itemsView: any,
  tree: any,
  itemIDs: Set<string>,
): boolean {
  if (
    typeof tree?.getFirstVisibleRow !== "function" ||
    typeof tree?.getLastVisibleRow !== "function" ||
    typeof itemsView?.getRow !== "function"
  ) {
    return false;
  }

  try {
    const first = Math.max(0, Number(tree.getFirstVisibleRow()));
    const last = Math.max(first, Number(tree.getLastVisibleRow()));
    let refreshed = false;
    for (let rowIndex = first; rowIndex <= last; rowIndex++) {
      const rowItemID = getRowItemID(itemsView.getRow(rowIndex));
      if (!rowItemID || !itemIDs.has(rowItemID)) continue;
      if (typeof tree.invalidateRow === "function") {
        tree.invalidateRow(rowIndex);
      } else if (typeof itemsView.invalidateRow === "function") {
        itemsView.invalidateRow(rowIndex);
      } else {
        return false;
      }
      refreshed = true;
    }
    return refreshed;
  } catch (error) {
    ztoolkit.log("Could not invalidate visible Zotero item rows", error);
    return false;
  }
}

function collectTargetItemIDs(targets: RefreshTarget[]): Set<string> {
  const itemIDs = new Set<string>();
  for (const target of targets) {
    const itemID = getTargetItemID(target);
    if (itemID) itemIDs.add(itemID);
  }
  return itemIDs;
}

export function invalidateItemRows(targets: RefreshTarget[]): boolean {
  if (!targets.length) return false;
  try {
    const itemsView = Zotero.getActiveZoteroPane?.()?.itemsView as any;
    const tree = itemsView?.tree || itemsView?._tree;
    const itemIDs = collectTargetItemIDs(targets);
    if (itemIDs.size === 0) return false;

    if (itemIDs.size > MAX_DIRECT_ROW_LOOKUPS) {
      if (invalidateVisibleRowsByID(itemsView, tree, itemIDs)) return true;
      return [
        callViewMethod(tree, "invalidate"),
        callViewMethod(itemsView, "invalidate"),
      ].some(Boolean);
    }

    let refreshed = false;

    for (const itemID of itemIDs) {
      const rowIndex = getRowIndexByItemID(itemsView, itemID);
      if (rowIndex === undefined) continue;

      if (typeof tree?.invalidateRow === "function") {
        tree.invalidateRow(rowIndex);
        refreshed = true;
      } else if (typeof itemsView?.invalidateRow === "function") {
        itemsView.invalidateRow(rowIndex);
        refreshed = true;
      }
    }

    return refreshed;
  } catch (error) {
    ztoolkit.log("Could not invalidate Zotero item rows", error);
    return false;
  }
}

export function softRefreshItemsView(targets: RefreshTarget[] = []): boolean {
  if (invalidateItemRows(targets)) return true;

  if (targets.length > 0) {
    return false;
  }

  try {
    const itemsView = Zotero.getActiveZoteroPane?.()?.itemsView as any;
    return [
      callViewMethod(itemsView?.tree, "invalidate"),
      callViewMethod(itemsView?._tree, "invalidate"),
    ].some(Boolean);
  } catch (error) {
    ztoolkit.log("Could not soft-refresh Zotero item view", error);
    return false;
  }
}

export function refreshItemsViewAndMaintainSelection(
  targets: RefreshTarget[] = [],
): boolean {
  if (invalidateItemRows(targets)) return true;

  if (targets.length > 0) {
    return false;
  }

  try {
    const itemsView = Zotero.getActiveZoteroPane?.()?.itemsView as any;
    if (callViewMethod(itemsView, "refreshAndMaintainSelection")) return true;
    if (callViewMethod(itemsView, "refresh")) return true;
    return softRefreshItemsView();
  } catch (error) {
    ztoolkit.log("Could not refresh Zotero item view", error);
    return false;
  }
}

export function getActiveViewIdentity(): string {
  const pane = Zotero.getActiveZoteroPane?.() as any;
  let libraryID = "";
  let collectionID = "";
  let savedSearchID = "";
  let groupID = "";

  try {
    libraryID = String(pane?.getSelectedLibraryID?.() ?? "");
  } catch {
    // The pane can be between collection-tree transitions.
  }
  try {
    collectionID = String(pane?.getSelectedCollection?.(true) ?? "");
  } catch {
    // Saved searches and group roots may not expose a collection ID.
  }
  try {
    savedSearchID = String(pane?.getSelectedSavedSearch?.(true) ?? "");
  } catch {
    // Optional API on older Zotero builds.
  }
  try {
    groupID = String(pane?.getSelectedGroup?.(true) ?? "");
  } catch {
    // Optional API on older Zotero builds.
  }

  return [libraryID, collectionID, savedSearchID, groupID].join("|");
}
