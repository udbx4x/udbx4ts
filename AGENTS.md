# AGENTS.md

本文件是 `udbx4ts` 仓库中 AI 智能体的执行入口。

进入本仓库后，所有智能体都应先阅读本文件，再阅读 CLAUDE.md 继续工作。

## 1. 项目目标

`udbx4ts` 的目标是在 **Web 浏览器** 与 **Electron** 环境中，用 TypeScript 实现 UDBX 空间数据库的读写、查询和流式处理能力。

当前项目不考虑：

- React Native
- 服务端代理模式
- 与当前阶段无关的新平台扩展

## 2. 必读文档顺序

1. [CLAUDE.md](./CLAUDE.md) — 项目架构、命令、关键约束
2. [README.md](./README.md) — 项目介绍、API 概览、使用示例

## 3. 当前架构基线

必须遵守以下基线：

- 架构为 `TypeScript Core + Web Runtime + Electron Runtime`
- 核心层保持平台无关
- 浏览器端采用 `SQLite WASM + Worker + OPFS` 主路线
- 浏览器端必须支持无 OPFS 的 fallback 模式
- Electron 端采用原生 SQLite 驱动
- 对外 API 统一使用异步接口
- 项目初期采用单包多入口，不擅自拆为 Monorepo

## 4. 当前支持的数据集类型

- `PointDataset` / `PointZDataset` — 2D/3D 点数据集
- `LineDataset` / `LineZDataset` — 2D/3D 线数据集
- `RegionDataset` / `RegionZDataset` — 2D/3D 面数据集
- `TabularDataset` — 纯属性表数据集
- `CadDataset` — CAD 几何数据集

## 5. 关键约束

### 5.1 不允许

- 在核心层依赖 DOM、Worker、Electron 或具体 SQLite 驱动
- 在浏览器主线程直接执行数据库操作
- 在渲染进程直接持有 Electron 数据库连接
- 绕过 `SqlDriver` 抽象直接访问数据库
- 跳过 `udbx4j` 兼容性验证
- 擅自扩大技术方案范围

### 5.2 必须做到

- 优先复用核心层能力，禁止在运行时层复制领域逻辑
- GAIA 实现建立在统一的二进制工具和 codec registry 之上
- 所有公共接口保持异步
- 所有批量写入使用事务
- 所有重要改动补齐测试

## 6. 任务执行方式

如果你是单个 agent：

- 先识别自己当前任务属于哪个模块
- 只修改自己任务边界内的文件
- 如果需要改公共契约，先更新文档或说明影响范围

如果你在多角色 agent team 中：

- 明确角色与任务边界
- 不跨角色大范围重写代码
- 不在契约未冻结前并行开发强依赖模块

## 7. 完成任务前的自检

提交前至少检查：

1. 是否符合 CLAUDE.md 中的架构约束
2. 是否补齐测试或说明未补原因
3. 是否引入了计划外范围
4. 是否会影响其他角色的任务边界

## 8. 发生冲突时的决策顺序

优先级从高到低为：

1. 当前用户明确要求
2. [CLAUDE.md](./CLAUDE.md)
3. [README.md](./README.md)
4. `udbx4spec/docs/` 中的跨语言规范

如果发现文档之间冲突，不要自行猜测扩展方向。
