# Release Notes

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
