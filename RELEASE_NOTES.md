# Release Notes

## v0.1.13

这是一次刷新失败热修，针对 V0.1.12 在真实 Zotero 中出现的“刷新失败，请查看 Zotero 错误日志”。

### 主要功能

- 将刷新结果保存后的列表重绘做成非致命步骤：`forceUpdate`、`invalidate`、`refreshAndMaintainSelection` 或 `Notifier.trigger` 失败时只记录日志，不再把整次刷新判定为失败。
- 将进度窗口更新做成非致命步骤：`changeLine` / `startCloseTimer` 失败时不影响已完成的分级结果。
- 真实核心刷新失败时，进度窗口会显示截断后的具体错误信息，不再只显示笼统的“请查看 Zotero 错误日志”。

### 校验

- `npm run check` 通过。
- matcher 测试 `65 passed`。
- 构建产物 manifest 版本为 `0.1.13`。

## v0.1.12

这是一次基于真实 Zotero UI 反馈的小修复。

### 主要功能

- 缩短右下角刷新进度窗口文案，移除过长取消说明，减少提示框横向撑开。
- 修复 `搜索 CCF 会议/期刊并设置...` 弹窗中搜索框和筛选器未正确显示/不可输入的问题：表单控件改为窗口加载后用 HTML DOM API 创建。
- 修复 `只刷新 Unknown / CCF None` 在大批量选中时先同步过滤导致卡顿的问题：筛选阶段现在也有进度、每 10 条让出 UI，并支持取消。

### 校验

- `npm run check` 通过。
- matcher 测试 `65 passed`。
- 构建产物 manifest 版本为 `0.1.12`。

## v0.1.11

这是一次批量刷新体验和手动设置搜索的小版本修复。

### 主要功能

- 新增 `取消当前 CCF 刷新`，可从右键菜单或顶部 `Tools/工具` 菜单停止任务；已完成的条目结果会保留。
- 批量刷新改为更细 chunk 让出 UI，并每 500 条分批保存，降低 5000 条刷新时的卡顿感。
- 批量刷新结束后优先触发 item tree 软重绘，必要时才按 item id 通知刷新，避免强制重建列表导致滚动位置回到顶部。
- 手动设置入口改为 `搜索 CCF 会议/期刊并设置...`，分类菜单改为 `按 CCF 分类浏览手动设置...`，降低理解成本。
- 搜索弹窗增加说明文字、候选别名预览，并支持 `theory`、`security`、`database` 等英文领域词模糊搜索。

### 校验

- `npm run check` 通过。
- matcher 测试 `64 passed`。
- 构建产物 manifest 版本为 `0.1.11`。

## v0.1.10

这是一次 CCF-only 识别准确性修复，不加入 SCI/JCR/中科院分区。

### 主要功能

- 新增右键菜单 `显示识别诊断`，可查看读取到的 Zotero 字段、候选 venue、最终判定和原因。
- 新增 `只刷新 Unknown / CCF None`，便于针对漏识别条目重算，不必每次刷新全部所选条目。
- 新增 `清除缓存并重新识别所选条目`，用于处理旧缓存或规则升级后的局部复算。
- 自动缓存增加 matcher 版本号；旧自动缓存会即时重算显示，手动设置和忽略状态继续保留。

### 识别增强

- 补全 ACM 常见缩写 venue：`TOIS`、`TOSEM`、`TIST`、`TOMM`、`TKDD`、`TWEB`、`TOCHI`、`PACMHCI`。
- 收紧误匹配保护：`ICMI`、`ICRAI`、`TSE`、`JBI`、`TOPS` 等相似 acronym/token 不再错误提升。
- `Companion Proceedings`、`Extended Abstracts`、`Workshop(s)` 默认不自动提升为主会；`HotSec` 这类 CCF Workshop 条目仍可正常匹配。
- `IEEE Access`、`Nature Communications`、`Scientific Reports`、`Information Fusion` 等高影响但非当前 CCF 目录期刊继续显示 `CCF None`。

### 校验

- `npm run check` 通过。
- matcher 测试 `62 passed`。
- 构建产物 manifest 版本为 `0.1.10`，Zotero 兼容范围保持 `6.999` 到 `10.0.*`。

## v0.1.9

这是 `CCF for Zotero` 的首个公开测试版本，主要面向 Zotero 10 用户。

### 主要功能

- 新增 Zotero 文献列表 `CCF` 列，显示 CCF A/B/C、CCF None、Preprint 和 Unknown。
- 本地离线匹配 CCF 2026 推荐会议/期刊目录。
- 支持右键刷新所选条目的 CCF 分级。
- 支持手动设置 CCF 来源，并可按会议/期刊、分类、A/B/C 等级浏览候选。
- 支持忽略条目和恢复自动匹配。

### 识别增强

- 支持 `INFOCOM`、`WWW`、`NAACL` 等长 proceedings 名称识别。
- 支持 ACL Anthology DOI/URL：
  - `10.18653/v1/2026.acl-long.293` -> `CCF A | ACL`
  - `10.18653/v1/2026.findings-acl.107` -> `CCF None | Findings ACL 2026`
- 支持 IEEE DOI 前缀：
  - `10.1109/INFOCOM...` -> `CCF A | INFOCOM`
  - `10.1109/ICMISI...` -> `CCF None | ICMISI`
- 对常见非 CCF venue 增加短名显示，例如 `KDD Explorations`、`AI Review`、`LNCS`、`Nat. Mach. Intell.`。

### 性能与安全

- 插件状态保存在私有 `Zotero.Prefs` 中。
- 一次 Zotero 会话只解析一次缓存，避免大库加载时反复解析大 JSON。
- 无缓存条目会即时计算显示，但不会立即写入缓存。
- 不修改 Zotero 文献字段，不写 `Extra`，不创建子笔记，默认不联网。

### 已知限制

- 这是早期测试版本，真实 Zotero 10 环境仍需要更多验证。
- `CCF None` 只表示不在当前 CCF 推荐目录，不代表会议或期刊质量判断。
- Zotero 元数据缺失或非常不规范时仍可能显示 `Unknown`。
- CCF 目录数据为人工/脚本整理结果，如发现错误请提交 issue。

### 安装

1. 下载本 release 附件中的 `.xpi` 文件。
2. Zotero -> `Tools` -> `Add-ons` -> 齿轮图标 -> `Install Add-on From File...`。
3. 选择 `.xpi` 文件并重启 Zotero。

建议普通用户下载 `ccf-for-zotero-0.1.9-zotero10.xpi`；`ccf-for-zotero.xpi` 主要供自动更新清单引用。

### 校验

本版本发布前本地验证：

- `npm run check` 通过。
- matcher 测试 `56 passed`。
- CCF PDF 数据审计通过。
