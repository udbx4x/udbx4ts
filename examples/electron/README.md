# Electron Example

使用 `udbx4ts/electron` 在 Electron 应用中读写 UDBX 空间数据库。

## 快速开始

```bash
# 安装依赖
npm install

# 运行
npm start
```

## 功能演示

1. **Open UDBX File** — 打开已有的 .udbx 文件
2. **Create New UDBX** — 创建新的 .udbx 文件
3. **Create Dataset** — 创建点/线/面/属性表数据集
4. **View** — 查看数据集中的要素（分页显示前 100 条）

## 架构

```
渲染进程 (index.html + preload.ts)
    ↕ contextBridge + ipcRenderer/ipcMain
主进程 (main.ts)
    ↕ better-sqlite3
本地 .udbx 文件 (SQLite)
```

- **主进程**：使用 `better-sqlite3` 直接访问 SQLite 文件
- **preload**：通过 `contextBridge` 安全暴露 API 给渲染进程
- **渲染进程**：纯 HTML/JS UI，不直接访问 Node.js API

## 关键代码

```typescript
// main.ts — 打开 UDBX 文件
import { createElectronUdbx } from "udbx4ts/electron";

const dataSource = await createElectronUdbx({ path: "/path/to/file.udbx" });
const datasets = await dataSource.listDatasets();
const pointDs = await dataSource.getDataset("BaseMap_P");
const features = await pointDs.list();
```
