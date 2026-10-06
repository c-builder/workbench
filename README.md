# 衡台 · 智能工作台 Demo

人和 Agent 共用一台电脑的员工助手原型：左侧对话编排意图，右侧是流程活动、内置浏览器与产物现场。交互遵循「控制权单一、可逆即自动、不可逆即交接、日志即信任」。

远程仓库：[c-builder/workbench](https://github.com/c-builder/workbench)

在线 Demo：[https://c-builder.github.io/workbench/](https://c-builder.github.io/workbench/)（由 GitHub Actions 构建并发布到 Pages）

## 本地运行

本地只跑开发服务，**不要执行 `npm run build`，也不要提交 `dist`**。发布由 GitHub Actions 在云端完成。

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://127.0.0.1:5173/`）。

## 可演示路径

- 单条协同：待办「协同处理」→ Agent 预填 → 停在提交前 → 人工确认
- 批量审批：勾选「待我审批」→ 预审标红差异项（默认不提交）→ 二次确认
- 应用内协同：应用中心 / 地址栏打开页面 →「让 Agent 处理当前页」
- 我的申请：他人节点只读跟踪与催办，不可代办
- 产物：预览 doc / ppt / xls / html，HTML 可在应用面板打开

## 发布

每次把代码推送到 `main`（或在 Actions 里手动 Run workflow），GitHub Actions 会在线执行 `npm ci` 和 `npm run build`，并把产物发布到 `gh-pages`。本地不生成、不提交 `dist`。

首次使用前在 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，Branch 选 `gh-pages` / `/ (root)`。之后每次提交都会自动更新 [在线 Demo](https://c-builder.github.io/workbench/)。
