# CCF for Zotero

一个面向中文用户的 Zotero 插件，用于在 Zotero 文献列表中离线显示 CCF 推荐会议/期刊等级。

当前版本：`0.1.16`

## 功能

- 在 Zotero 文献列表中增加 `CCF` 列，显示 `CCF A/B/C`、`CCF T1/T2/T3`、`CCF None`、`Preprint`、`Unknown`。
- 基于本地 CCF 2026 国际推荐目录和 2025 计算领域高质量科技期刊目录离线匹配，不依赖 Semantic Scholar、DBLP 或其他联网 API。
- 支持常见会议/期刊字段、缩写、Proceedings 长名称、ACL Anthology DOI/URL、IEEE DOI 前缀等线索。
- 支持右键批量刷新、取消当前刷新、只刷新 `Unknown / CCF None`、清除缓存后重新识别、显示识别诊断。
- 支持手动搜索并指定 CCF 来源、按分类浏览候选、忽略条目、恢复自动匹配。
- CCF 列排序使用轻量缓存排序键，避免在 5000+ 条主库中点击表头时同步重算全库。
- 仅写入插件私有 `Zotero.Prefs` 缓存，不修改 Zotero 条目的标题、会议名、期刊名、Extra，也不创建子笔记。

## V0.2 开发中：CAS 中科院分区

V0.2 的目标是在现有 CCF 功能之外增加独立的 `CAS` 列，用来显示中科院期刊分区。这个功能仍然遵守本项目的边界：只服务 `CCF` 和 `CAS`，不加入 SCI/JCR、影响因子、引用次数、Semantic Scholar/DBLP fallback 或用户反馈上传。

CAS 分区的产品形态是“插件内置数据”，不是让普通用户手动导入表格。开发流程是：

1. 维护者从中科院期刊分区表官方平台、官方公告、订阅机构授权导出或明确授权文件获取快照。
2. 使用 `npm run build:cas-catalog` 把授权原始数据转换成插件运行时 JSON。
3. 使用 `npm run audit:cas-catalog` 校验 ISSN、重复项、分区范围、大小类字段和来源哈希。
4. 只有在确认允许公开再分发时，`npm run audit:cas-public-release` 才会允许发布含完整 CAS 数据的公开 XPI。

当前公开源码只包含 `metadata-only` 的 CAS 占位快照，因此运行时会显示 `CAS 数据未内置`，不会把缺少官方数据误报为 `CAS None`。如果完整 CAS 数据只能个人/机构内部使用，可以生成私有内置构建；公开 release 不能打包未经授权再分发的全量分区表。

## 安装

1. 打开本项目的 GitHub Releases 页面。
2. 下载最新的 `.xpi` 文件，例如 release 附件中的 `ccf-for-zotero.xpi`。
3. 打开 Zotero，进入 `Tools` -> `Add-ons`。
4. 点击齿轮图标，选择 `Install Add-on From File...`。
5. 选择下载的 `.xpi`，安装后重启 Zotero。

## 使用

### 显示 CCF 列

在 Zotero 文献列表表头右键，勾选 `CCF` 列。

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

### 手动修正

如果自动识别不准确，可以右键：

- `CCF 分级助手` -> `搜索 CCF 会议/期刊并设置...`
- 或 `按 CCF 分类浏览手动设置...`

手动设置只保存到插件私有缓存，不会改动 Zotero 原始元数据。
推荐优先使用搜索弹窗，可输入简称、全称、中文分类或英文领域词，例如 `ACL`、`ACM MM`、`theory`、`security`。搜索框和筛选器由插件运行时创建，并使用自绘筛选菜单和候选列表，以兼容 Zotero 的混合 XUL/HTML 窗口。

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
- `Unknown` 表示插件没有找到足够的 venue 线索。

## 数据来源

- 国际会议/期刊 A/B/C 数据基于 CCF 2026 推荐国际学术会议和期刊目录整理。
- 中文/国内高质量期刊 T1/T2/T3 数据基于 CCF 2025 计算领域高质量科技期刊分级目录整理。
- 初始结构参考了开源项目 `CCF-Rank` 的数据组织方式，并对本地 CCF 官方 PDF 进行了人工/脚本审计。
- CAS 中科院期刊分区功能正在 V0.2 开发中；完整目录只接受官方/授权快照，且必须通过来源哈希和发布权限审计后才能进入公开安装包。
- 本插件不是 CCF 官方项目，目录数据可能存在整理误差；如发现问题，欢迎提交 issue。

## 开发

```powershell
npm install
npm run test
npm run build
npm run check
npm run audit:cas-catalog
```

构建产物位于 `.scaffold/build/`。

如果你是维护者并且已经取得 CAS 官方/授权导出文件，可以用下面的命令生成内置快照。普通用户不需要执行这一步：

```powershell
npm run build:cas-catalog -- --input <authorized-cas-export.json> --version <catalog-version> --edition <edition-label> --source <official-or-authorized-source> --redistribution private-only
npm run audit:cas-catalog
```

公开发布前必须额外运行：

```powershell
npm run audit:cas-public-release
```

如果数据没有明确的公开再分发授权，这个命令会失败；这是预期保护，避免把未经授权的 CAS 全量数据发布到 GitHub release。

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
