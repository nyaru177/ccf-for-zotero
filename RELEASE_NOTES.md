# Release Notes

## v0.1.15

这是一次中文 CCF 分级支持版本，新增 CCF 计算领域高质量科技期刊目录的 T1/T2/T3 识别。它仍然只处理 CCF 相关目录，不加入 SCI/JCR/中科院分区。

### 主要功能

- 新增 `src/data/ccf-high-quality-journals-2025.json`，收录 CCF 2025 计算领域高质量科技期刊 T1/T2/T3 共 68 条。
- CCF 列现在可显示 `CCF T1 | ...`、`CCF T2 | ...`、`CCF T3 | ...`，与原有国际目录 `CCF A/B/C` 并列显示。
- 手动设置弹窗和按分类浏览支持 `CCF T1/T2/T3`，可搜索 `电子学报`、`计算机学报`、`计算机应用` 等中文期刊。
- 匹配器保留 CJK 字符并对中文别名使用精确匹配，避免 `计算机应用` 误吞 `计算机应用研究`。

### 识别增强

- `电子学报` -> `CCF T1 | 电子学报`
- `Chinese Journal of Electronics` -> `CCF T1 | Chinese Journal of Electronics`
- `计算机应用` -> `CCF T2 | 计算机应用`
- `计算机应用研究` -> `CCF T3 | 计算机应用研究`
- `显示识别诊断` 会说明 T1/T2/T3 结果来自 `CCF 2025 计算领域高质量科技期刊目录`。

### 口径说明

- `CCF A/B/C` 来自 CCF 2026 推荐国际学术会议和期刊目录。
- `CCF T1/T2/T3` 来自 CCF 2025 计算领域高质量科技期刊分级目录。
- 两套目录不具有等效关系，因此插件不会把 `T1` 当作 `A`，也不会把 `T2/T3` 映射成 `B/C`。

### 校验

- `npm run check` 通过。
- matcher 测试 `67 passed`。

## v0.1.14

这是一次手动设置弹窗热修，针对真实 Zotero 中 `设置 CCF 来源` 搜索界面文字错位、类型/等级/分类无法下拉的问题。

### 主要功能

- 将类型、等级、分类筛选从原生 `<select>` 改成自绘下拉菜单，避免 Zotero XUL/HTML 混合窗口吞掉点击事件。
- 将候选项从原生 `<button>` 改成普通 HTML 行，修复多行文字被系统按钮高度压扁导致的重叠。
- 候选行改为两行布局：第一行显示 `CCF 等级 / 简称 / 类型 / 分类`，第二行显示全称和别名，长文本自动截断。

### 校验

- `npm run check` 通过。
- matcher 测试 `65 passed`。
- 构建产物 manifest 版本为 `0.1.14`。

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
