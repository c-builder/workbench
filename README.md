# 衡台 · 智能工作台 Demo

人和 Agent 共用一台电脑的员工助手原型：左侧对话编排意图，右侧是流程活动、内置浏览器与产物现场。交互遵循「控制权单一、可逆即自动、不可逆即交接、日志即信任」。

远程仓库：[c-builder/workbench](https://github.com/c-builder/workbench)

在线 Demo：[https://c-builder.github.io/workbench/](https://c-builder.github.io/workbench/)（由 GitHub Actions 构建并发布到 Pages）

## 本地运行

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

## GitHub Actions

推送到 `main` 或在 Actions 里手动 **Run workflow**，会执行 `npm ci` → `npm run build`，再把 `dist` 发布到 GitHub Pages。

仓库首次发布后，在 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，Branch 选 `gh-pages` / `/ (root)`。之后每次推送 `main` 都会自动重建并更新站点。
