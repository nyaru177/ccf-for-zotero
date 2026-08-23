# CCF for Zotero

一个面向中文用户的 Zotero 插件，用于在 Zotero 文献列表中离线显示 CCF 推荐会议/期刊等级。

当前版本：`0.1.9`

## 功能

- 在 Zotero 文献列表中增加 `CCF` 列，显示 `CCF A/B/C`、`CCF None`、`Preprint`、`Unknown`。
- 基于本地 CCF 2026 推荐目录离线匹配，不依赖 Semantic Scholar、DBLP 或其他联网 API。
- 支持常见会议/期刊字段、缩写、Proceedings 长名称、ACL Anthology DOI/URL、IEEE DOI 前缀等线索。
- 支持右键批量刷新、手动指定 CCF 来源、按分类浏览候选、忽略条目、恢复自动匹配。
- 仅写入插件私有 `Zotero.Prefs` 缓存，不修改 Zotero 条目的标题、会议名、期刊名、Extra，也不创建子笔记。

## 安装

1. 打开本项目的 GitHub Releases 页面。
2. 下载最新的 `.xpi` 文件，例如 `ccf-for-zotero-0.1.9-zotero10.xpi`。
3. 打开 Zotero，进入 `Tools` -> `Add-ons`。
4. 点击齿轮图标，选择 `Install Add-on From File...`。
5. 选择下载的 `.xpi`，安装后重启 Zotero。

## 使用

### 显示 CCF 列

在 Zotero 文献列表表头右键，勾选 `CCF` 列。

### 刷新识别结果

选中文献后右键：

- `CCF 分级助手` -> `刷新所选条目的 CCF 分级`

刷新结果会写入插件私有缓存。新条目没有缓存时，插件会先即时计算并临时显示结果；如果希望固定到缓存，请执行刷新。

### 手动修正

如果自动识别不准确，可以右键：

- `CCF 分级助手` -> `设置 CCF 来源...`
- 或 `按分类浏览设置`

手动设置只保存到插件私有缓存，不会改动 Zotero 原始元数据。

## 识别口径

- `ACL` 主会 long/short paper：识别为 `CCF A | ACL`，例如 `10.18653/v1/2026.acl-long.293`。
- `Findings of ACL/EMNLP`：保持 `CCF None`，不会自动升成 ACL/EMNLP 主会。
- `INFOCOM`、`WWW`、`NAACL` 等长 proceedings 名称会归一化识别。
- IEEE DOI 前缀可作为 venue 线索：例如 `10.1109/INFOCOM...` 可识别为 `INFOCOM`，`10.1109/ICMISI...` 会显示 `CCF None | ICMISI`。
- `CCF None` 只表示“不在当前 CCF 推荐目录中”，不等同于“低质量”或“野鸡会议”。
- `Unknown` 表示插件没有找到足够的 venue 线索。

## 数据来源

- CCF 目录数据基于 CCF 2026 推荐会议和期刊目录整理。
- 初始结构参考了开源项目 `CCF-Rank` 的数据组织方式，并对本地 CCF 官方 PDF 进行了人工/脚本审计。
- 本插件不是 CCF 官方项目，目录数据可能存在整理误差；如发现问题，欢迎提交 issue。

## 开发

```powershell
npm install
npm run test
npm run build
npm run check
```

构建产物位于 `.scaffold/build/`。

发布 release 时建议同时上传：

- `ccf-for-zotero-0.1.9-zotero10.xpi`：给用户手动下载安装。
- `ccf-for-zotero.xpi`：供 `update.json` 自动更新引用。
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
