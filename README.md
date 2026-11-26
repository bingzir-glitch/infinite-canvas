<p align="center">
  <img src="packages/workbench/public/logo.svg" width="96" alt="ModProt Canvas logo">
</p>

<h1 align="center">ModProt Canvas</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
  <a href="apps/docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="apps/docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="apps/docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="apps/docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="apps/docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="apps/cli/README.md">CLI 本地版</a>
</p>

ModProt Canvas 是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

本项目基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)（MIT 协议）派生并独立维护，保留原作者版权声明。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种本地存储格式都可能直接调整。

## 与上游的关系

本仓库是独立维护的 fork，不跟随上游自动更新：

- **品牌与展示层**已改为 ModProt Canvas（页面标题、首页、导出文件名）。
- **渠道预置列表已清空**，不包含上游的推广渠道；请在「配置 → 渠道」中填写自己的接口地址与密钥。
- **部署链已自建**，`docker-compose.yml` 从本仓库源码构建，不再拉取上游镜像。
- **npm 包名保持 `@infinite-canvas/*` 不变**，这样可以按需 cherry-pick 上游的功能修复；改动包名会让后续同步成本剧增。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：使用你配置的模型渠道，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 插件系统：内置插件市场，可安装、更新和管理插件，也支持上传插件包。开发可从 [最小插件模板](plugins/template/) 开始。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，适配各类中转站与自建服务。
- 提示词库：内置 7 个开源提示词来源并支持自定义标准 JSON 来源，由浏览器直连拉取并缓存在本地。

完整功能说明见 [功能介绍](apps/docs/content/docs/overview/features.mdx)。

## 内置插件

| 插件 | 说明 |
| --- | --- |
| [姿态图鉴](plugins/pose-atlas/) | 浏览 RuiC-PoseAtlas 的 288 组人体姿态 × 5 视角线稿，点图直接插入画布，支持三语搜索与原图下载。 |

## 快速开始

三种运行方式：

- **CLI 本地版**：功能完整，作品和渠道凭据保存在本机目录，支持插件命令行管理，并可通过 MCP 让 Codex、Claude Code 等 AI 助手操作画布。
- **纯 Web 版**：纯静态站点，数据保存在浏览器，不支持外部 AI 助手连接，适合部署静态站点。
- **桌面版**：用 Electron 窗口打开 CLI 本地版，需自行构建。

### 本地开发

需要 Node.js 22+ 与 pnpm：

```bash
git clone git@github.com:bingzir-glitch/infinite-canvas.git
cd infinite-canvas
pnpm install --frozen-lockfile
pnpm dev          # CLI 本地工作台
pnpm dev:web      # 纯 Web 版
pnpm dev:docs     # 文档站
```

### Docker 运行（纯 Web 版）

```bash
git clone git@github.com:bingzir-glitch/infinite-canvas.git
cd infinite-canvas
docker compose up -d
```

默认端口 3000，访问 `http://localhost:3000`。首次打开后进入右上角配置，填入自己的 OpenAI 兼容 `Base URL` 和 `API Key`。

统计分析为可选，在 `docker-compose.yml` 里取消 `environment` 段的注释并填入自己的 ID 即可，不填则不加载任何外部脚本。

### 构建插件

```bash
pnpm --dir plugins/pose-atlas build
```

插件源码在 `plugins/<插件 id>/`，构建产物输出到该目录 `dist/client.js`。开发时用 `pnpm --dir plugins/<插件 id> dev` 监听改动，然后在「设置 → 插件」启用。

## 联系方式

本 fork 的维护者：[bingzir-glitch](https://github.com/bingzir-glitch)

## 开源协议

[MIT](LICENSE) · 原始版权归 [basketikun](https://github.com/basketikun) 所有。

依据 MIT 协议，允许使用、复制、修改、合并、发布、分发、再许可和销售本软件副本，但需在副本中保留上述版权声明与许可声明。
