# Agent 协作与任务边界规范

## 1. 目的

本规范用于约束多角色 AI 智能体在 `udbx4ts` 项目中的协作方式，避免并行开发时出现接口漂移、职责重叠和重复实现。

本规范只服务于 [AGENT_TEAM_EXECUTION_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/AGENT_TEAM_EXECUTION_PLAN.md) 已定义的角色体系。

## 2. 协作基线

所有智能体都必须遵守以下共识：

- 先冻结契约，再并行实现
- 先补测试样例，再扩展功能
- 先完成 2D 点线面闭环，再扩展非关键功能

## 3. 文件边界规则

Core Architecture Agent 负责的主要边界：

- `src/core/types`
- `src/core/datasource`
- `src/core/dataset`
- `src/core/sql`

Codec Agent 负责的主要边界：

- `src/core/geometry/gaia`
- `src/core/utils` 中与二进制有关的实现
- `tests/unit/gaia`

Schema Agent 负责的主要边界：

- `src/core/schema`
- 元数据仓储相关模块
- `tests/integration/schema`

Browser Runtime Agent 负责的主要边界：

- `src/runtime-browser`
- `examples/browser`
- 浏览器相关测试

Electron Runtime Agent 负责的主要边界：

- `src/runtime-electron`
- `examples/electron`
- Electron 相关测试

QA & Compatibility Agent 负责的主要边界：

- `tests`
- 兼容性报告与夹具维护

DevEx & Release Agent 负责的主要边界：

- 根目录工程配置
- 构建脚本
- CI 与文档

## 4. 契约冻结规则

以下内容在进入并行实现前必须冻结：

- 核心目录结构
- 公共类型
- `SqlDriver` 契约
- GAIA codec 入口接口
- Browser Worker RPC 协议
- Electron IPC 协议

冻结后若要修改，必须：

1. 明确说明修改原因
2. 标记受影响模块
3. 同步到相关角色
4. 更新文档后再合并代码

## 5. 禁止行为

禁止以下协作行为：

- 在别的角色主责目录中大范围重写代码
- 未通知相关角色就修改公共契约
- 在运行时层复制核心层逻辑
- 为了赶进度跳过 `udbx4j` 兼容性验证
- 在任务未闭环前引入技术方案外的新方向

## 6. 提交内容要求

每个任务交付至少应包含：

- 实现代码
- 对应测试
- 必要的文档或注释更新

若任务暂未完成，也必须给出：

- 当前状态
- 已知问题
- 下一步建议

## 7. 阻塞升级规则

以下问题必须升级给 Technical Lead Agent：

- 核心接口需要破坏性调整
- `udbx4j` 行为与实现理解冲突
- 浏览器 OPFS 路线无法满足基本闭环
- Electron 原生驱动无法稳定集成
- 当前任务会破坏既定阶段依赖

## 8. 评审规则

评审时必须优先检查：

1. 是否符合技术方案
2. 是否破坏模块边界
3. 是否补齐测试
4. 是否引入额外范围

如果一个改动虽然“更通用”，但超出了当前技术方案边界，则应视为不符合规范。
