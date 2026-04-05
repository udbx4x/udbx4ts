# udbx4ts AI 开发规范

本目录存放供 AI 智能体使用的项目开发规范。

这些规范只约束 `udbx4ts` 当前技术方案中最关键的实现问题，不作为通用软件工程手册使用。所有规范都必须与以下文档保持一致：

- [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md)
- [AGENT_TEAM_EXECUTION_PLAN.md](../AGENT_TEAM_EXECUTION_PLAN.md)

## 适用范围

适用于以下开发活动：

- 核心层代码设计与实现
- GAIA 几何编解码实现
- 浏览器运行时实现
- Electron 运行时实现
- 测试、兼容性验证与任务协作

不适用于以下内容：

- 通用 UI/产品设计规范
- 与当前技术方案无关的跨平台扩展规范
- React Native、服务端代理或其他非目标平台规范
- 泛化的团队管理制度

## 规范列表

- [01-module-boundaries.md](./01-module-boundaries.md)
- [02-gaia-codec-and-binary.md](./02-gaia-codec-and-binary.md)
- [03-sql-and-runtime-implementation.md](./03-sql-and-runtime-implementation.md)
- [04-testing-and-compatibility.md](./04-testing-and-compatibility.md)
- [05-agent-collaboration-boundaries.md](./05-agent-collaboration-boundaries.md)

## 使用规则

1. 开发前先判断改动属于哪个主题规范。
2. 若多个规范同时适用，优先遵守更贴近当前改动的规范。
3. 如果规范与技术方案冲突，以技术方案为准，并先更新规范再继续开发。
4. 任何智能体都不得自行扩展规范范围，把当前项目变成新的平台或架构实验。
