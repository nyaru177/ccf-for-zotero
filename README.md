# CCF for Zotero

<p align="center">
  <img src="addon/content/icons/ccf-cas-96.png" alt="CCF for Zotero" width="96">
</p>

<p align="center">
  <strong>在 Zotero 中查看 CCF 与 CAS 分级</strong><br>
  面向中国用户的离线分级助手，支持 Zotero 10。
</p>

<p align="center">
  <a href="https://github.com/nyaru177/ccf-for-zotero/releases/latest"><img src="https://img.shields.io/github/v/release/nyaru177/ccf-for-zotero?style=flat-square&label=release" alt="Latest release"></a>
  <a href="https://github.com/nyaru177/ccf-for-zotero/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/nyaru177/ccf-for-zotero/ci.yml?branch=v0.2-cas&style=flat-square&label=CI" alt="CI status"></a>
  <img src="https://img.shields.io/badge/Zotero-10.x-CC2936?style=flat-square&logo=zotero&logoColor=white" alt="Zotero 10">
  <img src="https://img.shields.io/github/license/nyaru177/ccf-for-zotero?style=flat-square" alt="License">
</p>

当前版本：`0.2.5`

## 界面预览

<p align="center">
  <img src="assets/readme/item-list.png" alt="Zotero 文献列表中的 CCF 和 CAS 分级列" width="49%"><img src="assets/readme/context-menu.png" alt="条目右键菜单中的 CCF/CAS 分级助手子菜单" width="49%">
</p>

<p align="center"><em>左：文献列表中的 CCF / CAS 分级徽章；右：条目右键菜单中的分级助手</em></p>

<p align="center">
  <img src="assets/readme/initialization-settings.png" alt="CCF/CAS 分级助手设置页与初始化任务" width="82%">
</p>

<p align="center"><em>设置页：选择范围与识别项目，控制初始化与后台任务</em></p>

## 功能

| 模块 | 支持内容 |
| --- | --- |
| CCF | 国际目录 A/B/C；CCF 计算领域高质量科技期刊 T1/T2/T3 |
| CAS | 中科院期刊 1 区、2 区、3 区、4 区 |
| 识别线索 | DOI、ISSN/eISSN、期刊/会议全称、简称、别名、长 proceedings 名称 |
| 操作 | 批量刷新、仅刷新待确认结果、取消、手动设置、忽略、恢复自动匹配、诊断 |
| 大库体验 | 缓存优先、轻量排序、分批处理、进度显示，不在排序时重算整库 |

## 安装

1. 前往 [Releases](https://github.com/nyaru177/ccf-for-zotero/releases) 下载 `ccf-for-zotero-0.2.5-zotero10.xpi`。
2. 打开 Zotero，进入 `工具` -> `插件`。
3. 点击右上角齿轮，选择 `Install Add-on From File...`。
4. 选择下载的 `.xpi` 文件，安装后重启 Zotero。

## 快速开始

1. 在 Zotero 文献列表表头右键，勾选 `CCF` 和 `CAS` 列。
2. 选中文献后右键，在 `CCF/CAS 分级助手` 中选择刷新、诊断或手动设置。
3. 第一次使用时，打开 `编辑` -> `设置` -> `CCF/CAS 分级助手`，选择处理范围和识别项目，点击 `开始初始化`。

初始化支持当前集合、我的文库全部文献和当前选中条目。默认采用增量识别，已经有有效缓存的条目会跳过；任务带进度和取消操作，已完成的批次会保留。插件不会因为打开主库就自动刷新全部文献。

## 识别结果

| 显示 | 含义 |
| --- | --- |
| `CCF A/B/C` | 命中 CCF 国际推荐目录 |
| `CCF T1/T2/T3` | 命中 CCF 计算领域高质量科技期刊目录 |
| `CCF None` | 已识别出出版物，但不在当前 CCF 目录中 |
| `CAS 1区/2区/3区/4区` | 命中内置 CAS 期刊分区快照 |
| `CAS None` | 已识别为期刊，但当前快照中没有对应记录 |
| `N/A` | 条目不是期刊，CAS 不适用 |
| `Unknown` | 当前元数据不足以确定出版物身份 |

`CCF A/B/C` 与 `CCF T1/T2/T3` 属于两套不同目录，插件不会将它们互相换算。

## 手动设置

自动识别不准确时，可以使用右键菜单中的搜索功能：

- CCF：搜索会议/期刊简称、全称、中文分类或英文领域词。
- CAS：搜索 ISSN、期刊简称、全称、大类或小类。

手动设置、忽略状态和自动识别结果分别保存，手动选择不会被后续自动刷新覆盖。

## 数据来源

- CCF 国际会议/期刊 A/B/C：根据 [CCF 推荐国际学术会议和期刊目录](https://www.ccf.org.cn/Academic_Evaluation/By_category/) 整理。
- CCF 中文/国内高质量科技期刊 T1/T2/T3：根据 CCF 2025 计算领域高质量科技期刊分级目录整理。
- CAS：内置 [hitfyd/ShowJCR](https://github.com/hitfyd/ShowJCR) 的 `FQBJCR2025-UTF8.csv` 转换快照，共 21,772 本期刊。

CAS 快照的版本、来源哈希和字段说明记录在仓库代码与 [发布说明](RELEASE_NOTES.md) 中。它是第三方数据快照，不等同于中科院官方发布表。

## 隐私与性能

- 默认离线运行，不调用 Semantic Scholar、DBLP 或其他联网 API。
- 结果保存在插件私有缓存中，不修改标题、作者、期刊名、会议名和 `Extra`。
- 不创建子笔记，不向外部上传文献数据。
- 自定义列读取缓存，批量任务分批让出界面并支持取消。

## 开发

```powershell
npm ci
npm run check
npm run audit:cas-catalog
```

构建产物位于 `.scaffold/build/`。

欢迎通过 [Issues](https://github.com/nyaru177/ccf-for-zotero/issues) 报告识别问题或提交改进建议。

## 致谢

本项目参考了以下项目的数据组织和 Zotero 插件实现：

- [CCF-Rank](https://github.com/GroundbreakerLhy/CCF-Rank)
- [Zotero CCF Plus](https://github.com/Fangziyang0910/zotero-ccf-plus)
- [Zotero Plugin Scaffold](https://github.com/windingwind/zotero-plugin-template)

## 许可证

本项目以 [AGPL-3.0-or-later](LICENSE) 协议开源。
