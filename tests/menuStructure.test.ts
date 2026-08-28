import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const menuSource = () =>
  readFileSync(resolve(projectRoot, "src/modules/menu.ts"), "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf("export function " + name);
  assert.notEqual(start, -1);
  const next = source.indexOf("\nexport function ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("CCF/CAS menu organization", () => {
  it("groups the right-click menu into task, CCF, and CAS submenus", () => {
    const source = menuSource();
    const rightClickMenu = functionBody(source, "registerRightClickMenu");

    assert.match(source, /appendTaskMenuSection/);
    assert.match(source, /appendCCFMenuSection/);
    assert.match(source, /appendCASRankingMenuSection/);
    assert.match(source, /taskGroup: "初始化与后台任务"/);
    assert.match(source, /ccfGroup: "CCF 分级"/);
    assert.match(source, /casGroup: "CAS 中科院分区"/);
    assert.match(rightClickMenu, /appendPluginMenuSections\(doc, win, popup\)/);
  });

  it("groups the top Tools menu with the same task, CCF, and CAS submenus", () => {
    const source = menuSource();
    const toolsMenu = functionBody(source, "registerToolsMenu");

    assert.match(toolsMenu, /appendPluginMenuSections\(doc, win, popup\)/);
    assert.doesNotMatch(toolsMenu, /setAttribute\("label", text\.refresh\)/);
    assert.doesNotMatch(toolsMenu, /setAttribute\("label", casText\.refresh\)/);
  });

  it("keeps CAS menu labels concise inside the CAS submenu", () => {
    const source = menuSource();

    assert.match(source, /casMenuLabels/);
    assert.match(source, /refresh: "刷新所选条目"/);
    assert.match(source, /refreshUnknownNone: "只刷新 Unknown \/ CAS None"/);
    assert.match(source, /manual: "搜索期刊并手动设置\.\.\."/);
  });

  it("applies the plugin icon to native XUL root menus", () => {
    const source = menuSource();

    assert.match(
      source,
      /setAttribute\("class", "menu-iconic"\)[\s\S]*setAttribute\("image", PLUGIN_MENU_ICON\)/,
    );
    assert.match(
      source,
      /const PLUGIN_MENU_ICON =\s*"chrome:\/\/" \+ config\.addonRef \+ "\/content\/icons\/ccf-cas-48\.png"/,
    );
  });
});
