# AGENTS.md

本文件是 `udbx4ts` 仓库中 AI 智能体的执行入口。

进入本仓库后，所有智能体都应先阅读本文件，再按引用文档继续工作。

## 1. 项目目标

`udbx4ts` 的目标是在 **Web 浏览器** 与 **Electron** 环境中，用 TypeScript 实现 UDBX 空间数据库的读写、查询和流式处理能力。

当前项目不考虑：

- React Native
- 服务端代理模式
- 与当前阶段无关的新平台扩展

## 2. 必读文档顺序

1. [TECHNICAL_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/TECHNICAL_PLAN.md)
2. [AGENT_TEAM_EXECUTION_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/AGENT_TEAM_EXECUTION_PLAN.md)
3. [development-standards/README.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/README.md)

如果任务涉及特定主题，再继续阅读对应规范：

- 模块边界：[01-module-boundaries.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/01-module-boundaries.md)
- GAIA codec：[02-gaia-codec-and-binary.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/02-gaia-codec-and-binary.md)
- SQL 与运行时：[03-sql-and-runtime-implementation.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/03-sql-and-runtime-implementation.md)
- 测试与兼容性：[04-testing-and-compatibility.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/04-testing-and-compatibility.md)
- 协作边界：[05-agent-collaboration-boundaries.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/development-standards/05-agent-collaboration-boundaries.md)

## 3. 当前架构基线

必须遵守以下基线：

- 架构为 `TypeScript Core + Web Runtime + Electron Runtime`
- 核心层保持平台无关
- 浏览器端采用 `SQLite WASM + Worker + OPFS` 主路线
- 浏览器端必须支持无 OPFS 的 fallback 模式
- Electron 端采用原生 SQLite 驱动
- 对外 API 统一使用异步接口
- 项目初期采用单包多入口，不擅自拆为 Monorepo

## 4. 当前开发优先级

优先级顺序固定为：

1. 工程骨架与接口契约
2. 二进制基础设施
3. GAIA codec
4. 系统表与元数据仓储
5. 核心数据源与 2D 点线面数据集
6. 浏览器运行时闭环
7. Electron 运行时闭环
8. 测试、兼容性与稳定化

在 2D 点线面闭环稳定之前，不优先扩展：

- CAD
- 3D 数据集
- 性能优化型重构

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

- 按 [AGENT_TEAM_EXECUTION_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/AGENT_TEAM_EXECUTION_PLAN.md) 的角色与任务边界执行
- 不跨角色大范围重写代码
- 不在契约未冻结前并行开发强依赖模块

## 7. 完成任务前的自检

提交前至少检查：

1. 是否符合技术方案
2. 是否符合对应开发规范
3. 是否补齐测试或说明未补原因
4. 是否引入了计划外范围
5. 是否会影响其他角色的任务边界

## 8. 发生冲突时的决策顺序

优先级从高到低为：

1. 当前用户明确要求
2. [TECHNICAL_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/TECHNICAL_PLAN.md)
3. [AGENT_TEAM_EXECUTION_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/AGENT_TEAM_EXECUTION_PLAN.md)
4. `development-standards/` 下的各项规范

如果发现文档之间冲突，不要自行猜测扩展方向，应先收敛到技术方案并补齐文档。
