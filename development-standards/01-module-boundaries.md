# 模块边界规范

## 1. 目的

本规范用于约束 `udbx4ts` 的模块划分、依赖方向和公共接口设计，确保实现符合 `TypeScript Core + Web Runtime + Electron Runtime` 的技术路线。

## 2. 目录边界

项目实现必须围绕以下主目录组织：

- `src/core`
- `src/runtime-browser`
- `src/runtime-electron`
- `src/shared-runtime`

禁止在第一阶段内引入新的一级运行时目录来承载非目标平台。

## 3. 核心层规则

`src/core` 必须满足以下要求：

- 只能包含平台无关的领域逻辑
- 不得依赖 DOM API
- 不得依赖 Worker API
- 不得依赖 Electron API
- 不得直接依赖原生 SQLite 驱动

`src/core` 允许包含以下内容：

- 数据源抽象与实现
- 数据集抽象与实现
- GAIA/CAD 几何编解码
- 系统表初始化与元数据仓储
- SQL 抽象接口
- 二进制工具类

## 4. 运行时层规则

`src/runtime-browser` 只负责浏览器侧能力：

- Worker 生命周期
- `sqlite3.wasm` 装载
- OPFS 与 fallback 内存模式
- 文件导入导出
- 主线程与 Worker 的 RPC

`src/runtime-electron` 只负责 Electron 侧能力：

- SQLite 驱动适配
- 主进程数据库服务
- IPC 协议
- 本地文件打开、创建、备份和关闭

任何运行时层都不得复制核心领域逻辑。运行时层必须通过核心层公开接口复用能力。

## 5. 依赖方向

依赖方向必须始终保持为：

- `src/core` 不依赖任何运行时层
- `src/shared-runtime` 可被两个运行时层依赖
- `src/runtime-browser` 和 `src/runtime-electron` 可以依赖 `src/core`

禁止反向依赖：

- `src/core` 引用 `src/runtime-browser`
- `src/core` 引用 `src/runtime-electron`
- `src/runtime-browser` 与 `src/runtime-electron` 直接互相依赖

## 6. 公共 API 规则

所有对外公共 API 必须遵守：

- 统一异步接口
- 明确平台入口
- 不自动猜测运行时

允许：

```ts
import { createBrowserUdbx } from "udbx4ts/web";
import { createElectronUdbx } from "udbx4ts/electron";
```

禁止：

- 通过单一黑盒入口在运行时隐式探测平台
- 在公共 API 中暴露只适用于某个平台的内部对象

## 7. 数据集设计规则

数据集设计必须遵守：

- 以元数据驱动为主
- 以组合优先于深继承
- `PointDataset`、`LineDataset`、`RegionDataset` 为轻量语义封装

禁止：

- 机械照搬 `udbx4j` 的类层次
- 为了贴近 Java 命名而牺牲 TypeScript 可读性
- 在每个数据集里复制大段相同 SQL/映射逻辑

## 8. 包结构规则

第一阶段必须保持单包多入口结构。

允许：

- 一个 npm 包
- `exports` 暴露 `.`、`./web`、`./electron`

禁止：

- 未经明确决策拆成 Monorepo
- 在没有必要的情况下新增多个发布包

## 9. 变更约束

任何涉及以下内容的改动，必须先更新接口设计或规范再实现：

- 核心目录结构
- 公共 API 入口
- `SqlDriver` 契约
- `DatasetInfo` / `FieldInfo` / `DatasetKind`

如果改动会破坏已有阶段任务依赖，必须先同步给 Technical Lead Agent。
