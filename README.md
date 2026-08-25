# CCF for Zotero

一个面向中文用户的 Zotero 插件，用于在 Zotero 文献列表中离线显示 CCF 推荐会议/期刊等级和 CAS 中科院期刊分区。

当前版本：`0.2.1`

## 功能

- 在 Zotero 文献列表中增加 `CCF` 列，显示 `CCF A/B/C`、`CCF T1/T2/T3`、`CCF None`、`Preprint`、`Unknown`。
- 在 Zotero 文献列表中增加 `CAS` 列，显示 `CAS 1区/2区/3区/4区`、`CAS None`、`N/A`、`Unknown`。
- 基于本地 CCF 2026 国际推荐目录和 2025 计算领域高质量科技期刊目录离线匹配，不依赖 Semantic Scholar、DBLP 或其他联网 API。
- 内置 2025 CAS 中科院期刊分区快照，CAS 优先按 ISSN/eISSN 精确匹配，其次按期刊全称、简称和别名匹配。
- 支持常见会议/期刊字段、缩写、Proceedings 长名称、ACL Anthology DOI/URL、IEEE DOI 前缀等线索。
- 支持右键批量刷新、取消当前刷新、只刷新 `Unknown / CCF None`、清除缓存后重新识别、显示识别诊断。
- 支持手动搜索并指定 CCF 来源或 CAS 期刊、按分类浏览候选、忽略条目、恢复自动匹配。
- CCF/CAS 列排序使用轻量缓存排序键，避免在 5000+ 条主库中点击表头时同步重算全库。
- 仅写入插件私有 `Zotero.Prefs` 缓存，不修改 Zotero 条目的标题、会议名、期刊名、Extra，也不创建子笔记。

## CAS 中科院分区

V0.2 在现有 CCF 功能之外增加独立的 `CAS` 列，用来显示中科院期刊分区。这个功能仍然遵守本项目边界：只服务 `CCF` 和 `CAS`，不加入 SCI/JCR、影响因子、引用次数、Semantic Scholar/DBLP fallback 或用户反馈上传。

本版 CAS 数据直接内置在插件中，普通用户不需要手动导入表格。内置快照来自 `hitfyd/ShowJCR` 项目的 `FQBJCR2025-UTF8.csv`，该项目说明数据来源于 `advanced.fenqubiao.com` 查询结果。

- 快照版本：`CAS-2025-showjcr`
- 原始文件：`FQBJCR2025-UTF8.csv`
- 原始文件 SHA-256：`481224dca2cacc1cce49afb44c968d734c834e498e5ff054f15efb5a548789fc`
- 目录规模：`21772` 本期刊，包含大类/小类分区、Top、预警标注等字段。

重要说明：本项目不是中科院分区表官方项目，`hitfyd/ShowJCR` 也不是官方授权再分发渠道。当前快照作为第三方公开数据内置，主要用于个人/本地研究便利；如果你要做严格公开分发、机构内合规部署或商业使用，请替换为官方/授权快照，并重新运行来源与发布权限审计。

## 安装

1. 打开本项目的 GitHub Releases 页面。
2. 下载最新的 `.xpi` 文件，例如 release 附件中的 `ccf-for-zotero.xpi`。
3. 打开 Zotero，进入 `Tools` -> `Add-ons`。
4. 点击齿轮图标，选择 `Install Add-on From File...`。
5. 选择下载的 `.xpi`，安装后重启 Zotero。

## 使用

### 显示列

在 Zotero 文献列表表头右键，按需要勾选 `CCF` 列和 `CAS` 列。

### 刷新识别结果

选中文献后右键：

- `CCF 分级助手` -> `刷新所选条目的 CCF 分级`
- `CCF 分级助手` -> `只刷新 Unknown / CCF None`
- `CCF 分级助手` -> `清除缓存并重新识别所选条目`
- `CCF 分级助手` -> `取消当前 CCF 刷新`
- `CCF 分级助手` -> `显示识别诊断`

刷新结果会写入插件私有缓存。大批量刷新时会分批让出 UI；如果取消，已完成的条目结果会保留。`只刷新 Unknown / CCF None` 会先分批筛选，再刷新命中的条目。刷新中也可以从顶部 `Tools/工具` 菜单进入 `CCF 分级助手` 取消。
新条目或元数据刚被魔法棒修正的条目，如果没有有效缓存，CCF 列会先显示 `Unknown`；执行刷新后会写入新的自动结果。这样点击 CCF 表头排序时不会为了无缓存条目同步重算整个主库。
V0.1.16 起，自动缓存会记录识别输入指纹；本版会让旧自动缓存失效一次，之后如果 DOI、会议名、期刊名等关键字段变化，对应自动缓存会失效并在下一次刷新时更新。手动设置和忽略状态仍然保留，不会被自动覆盖。
V0.1.13 起，刷新完成后的列表重绘和进度窗口更新如果遇到 Zotero 10 UI API 差异，会记录日志但不再把已完成的分级结果误报为整次刷新失败。

`显示识别诊断` 只读取当前条目的字段和候选 venue，不会写入 Zotero 数据，适合排查为什么显示 `Unknown` 或 `CCF None`。诊断中会显示命中字段、命中线索和匹配规则。

CAS 操作在同一个右键菜单里，以 `CAS：` 开头：

- `CAS：刷新所选条目的中科院分区`
- `CAS：只刷新 Unknown / CAS None`
- `CAS：清除缓存并重新识别`
- `CAS：取消当前刷新`
- `CAS：显示识别诊断`

CAS 刷新同样写入插件私有缓存，支持大批量进度和取消；已完成的条目结果会保留。

### 手动修正

如果自动识别不准确，可以右键：

- `CCF 分级助手` -> `搜索 CCF 会议/期刊并设置...`
- 或 `按 CCF 分类浏览手动设置...`
- CAS 期刊可使用 `CAS：搜索期刊并手动设置...`

手动设置只保存到插件私有缓存，不会改动 Zotero 原始元数据。
推荐优先使用搜索弹窗，可输入简称、全称、中文分类或英文领域词，例如 `ACL`、`ACM MM`、`theory`、`security`。搜索框和筛选器由插件运行时创建，并使用自绘筛选菜单和候选列表，以兼容 Zotero 的混合 XUL/HTML 窗口。
CAS 手动搜索可输入 ISSN、期刊简称、期刊全称、大类或小类，例如 `0360-0300`、`ACM COMPUTING SURVEYS`、`计算机科学`。

## 识别口径

- `ACL` 主会 long/short paper：识别为 `CCF A | ACL`，例如 `10.18653/v1/2026.acl-long.293`。
- `Findings of ACL/EMNLP`：保持 `CCF None`，不会自动升成 ACL/EMNLP 主会。
- `INFOCOM`、`WWW`、`NAACL` 等长 proceedings 名称会归一化识别。
- `TOIS`、`TOSEM`、`TIST`、`TOMM`、`TKDD`、`TWEB`、`TOCHI`、`PACMHCI` 等 ACM 缩写期刊/Proceedings 形式会按 CCF 目录匹配。
- `电子学报`、`计算机学报` 等中文期刊会按 CCF 2025 计算领域高质量科技期刊目录显示为 `CCF T1/T2/T3`，例如 `电子学报` -> `CCF T1 | 电子学报`。
- `CCF A/B/C` 与 `CCF T1/T2/T3` 来自两套不同目录；`T1/T2/T3` 不等同于国际目录里的 `A/B/C`。
- `Companion Proceedings`、`Extended Abstracts`、`Workshop(s)` 默认不会自动提升为主会；真实 CCF Workshop 条目仍可匹配。
- IEEE DOI 前缀可作为 venue 线索：例如 `10.1109/INFOCOM...` 可识别为 `INFOCOM`，`10.1109/ICMISI...` 会显示 `CCF None | ICMISI`。
- `CCF None` 只表示“不在当前 CCF 推荐目录中”，不等同于“低质量”或“野鸡会议”。
- CAS 只适用于期刊条目；会议、图书、预印本等非期刊条目显示 `N/A`。
- CAS 优先使用 ISSN/eISSN 精确匹配；没有 ISSN 时再使用期刊全称、简称和别名。
- `CAS None` 表示插件已识别为期刊，但未命中当前内置 CAS 快照。
- `Unknown` 表示插件没有找到足够的 CCF venue 或 CAS 期刊身份线索。

## 数据来源

- 国际会议/期刊 A/B/C 数据基于 CCF 2026 推荐国际学术会议和期刊目录整理。
- 中文/国内高质量期刊 T1/T2/T3 数据基于 CCF 2025 计算领域高质量科技期刊分级目录整理。
- 初始结构参考了开源项目 `CCF-Rank` 的数据组织方式，并对本地 CCF 官方 PDF 进行了人工/脚本审计。
- CAS 中科院期刊分区数据来自 `hitfyd/ShowJCR` 的 `FQBJCR2025-UTF8.csv`，其 README 说明数据来源于 `advanced.fenqubiao.com`；本项目将该 CSV 转换为内置运行时 JSON。
- CAS 快照已记录原始文件哈希、访问日期和来源说明；`npm run audit:cas-catalog` 会校验分区字段、ISSN、重复 key、Top/预警标注和来源哈希。
- 本插件不是 CCF 或中科院分区表官方项目，目录数据可能存在整理误差或第三方来源限制；如发现问题，欢迎提交 issue。

## 开发

```powershell
npm install
npm run test
npm run build
npm run check
npm run audit:cas-catalog
```

构建产物位于 `.scaffold/build/`。

如果你是维护者并且需要重建 CAS 内置快照，可以用下面的命令生成运行时 JSON。普通用户不需要执行这一步：

```powershell
npm run build:cas-catalog -- --input <cas-export.json|csv|tsv> --catalog-version <catalog-version> --edition <edition-label> --source <source-description> --source-kind <source-kind> --permission-note <permission-note> --redistribution private-only
npm run audit:cas-catalog
```

公开发布前必须额外运行：

```powershell
npm run audit:cas-public-release
```

如果数据没有明确的公开再分发授权，`audit:cas-public-release` 会失败；这是预期保护。当前内置的 ShowJCR 快照是第三方公开数据，`audit:cas-catalog` 通过，但不被标记为官方/授权再分发数据。

发布 release 时建议同时上传：

- `ccf-for-zotero.xpi`：给用户手动下载安装，也供自动更新清单引用。
- `update.json`：Zotero 自动更新清单。

## 隐私与安全

- 默认不联网。
- 不修改 Zotero 条目字段。
- 不写入 `Extra`。
- 不创建子笔记。
- 自动/手动识别状态保存在插件私有偏好设置中。

## 致谢

本项目开发过程中参考和学习了以下项目：

- `CCF-Rank`
- `Zotero CCF Plus`
- Zotero Plugin Scaffold / Zotero Plugin Toolkit 生态

## 许可证

本项目以 `AGPL-3.0-or-later` 协议开源。
