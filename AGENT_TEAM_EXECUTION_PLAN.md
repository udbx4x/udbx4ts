# udbx4ts Agent Team 实施计划与任务清单

## 1. 文档目的

本文档用于把 [TECHNICAL_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/TECHNICAL_PLAN.md) 转化为一份可由多角色智能体团队直接执行的实施计划。

本文档回答四个问题：

- 哪些工作流可以并行推进
- 每个角色负责什么边界
- 每个阶段的输入、输出和验收标准是什么
- 每项任务的前置依赖、交付物和完成定义是什么

---

## 2. 总体执行原则

### 2.1 执行目标

以最小风险完成 `udbx4ts` 在 **Web + Electron** 双平台的可运行闭环：

- 核心层使用纯 TypeScript 实现
- 浏览器端采用 `SQLite WASM + Worker + OPFS`
- 浏览器端提供无 `OPFS` 的降级模式
- Electron 端采用原生 SQLite 驱动
- 与 `udbx4j` 在 UDBX 系统表与 GAIA 编解码上保持兼容

### 2.2 执行策略

- 先打通骨架，再补功能
- 先验证兼容性，再优化性能
- 先完成 2D 点线面闭环，再扩展 3D 与 CAD
- 所有并行任务都必须有清晰的文件边界和接口契约
- 所有角色以文档、测试和可运行样例作为交付物，而不是只提交代码

### 2.3 主关键路径

项目关键路径如下：

1. 工程骨架与构建体系
2. 二进制基础设施与 GAIA codec 内核
3. 系统表初始化与元数据仓储
4. 核心数据源与点线面数据集
5. 浏览器运行时闭环
6. Electron 运行时闭环
7. 兼容性验证与稳定化

其中最关键、最容易卡住全局的部分是：

- GAIA 编解码正确性
- 浏览器端 `Worker + WASM + OPFS` 链路
- 系统表创建与数据集注册一致性

---

## 3. Agent Team 角色定义

建议至少配置以下 8 个角色。一个 agent 可以兼任多个角色，但责任边界必须清晰。

### 3.1 角色 A：Technical Lead Agent

职责：

- 维护总体技术决策与阶段节奏
- 控制接口契约和模块边界
- 合并跨模块设计决策
- 处理阻塞升级与方案偏差

主要产出：

- 里程碑计划
- 接口契约文档
- 阶段验收结论
- 风险清单与处置决策

### 3.2 角色 B：Core Architecture Agent

职责：

- 搭建 `src/core` 骨架
- 定义核心类型、数据源抽象、数据集抽象、SQL 抽象
- 约束平台层与核心层的边界

主要产出：

- `src/core/types`
- `src/core/datasource`
- `src/core/dataset`
- `src/core/sql`
- 核心层接口文档

### 3.3 角色 C：Codec Agent

职责：

- 实现 `BinaryCursor`、`BinaryWriter`
- 实现 GAIA header 解析
- 实现 Point / Line / Polygon 编解码
- 维护 golden bytes 测试

主要产出：

- `src/core/geometry/gaia`
- `tests/unit/gaia`
- 与 `udbx4j` 的字节级对照测试

### 3.4 角色 D：Schema Agent

职责：

- 梳理 UDBX 必需系统表
- 实现系统表初始化逻辑
- 实现注册表和字段元数据仓储
- 验证新建库与参考实现一致性

主要产出：

- `src/core/schema`
- `src/core/repository` 或等价模块
- `tests/integration/schema`

### 3.5 角色 E：Browser Runtime Agent

职责：

- 实现浏览器端 Worker 运行时
- 集成 `sqlite3.wasm`
- 打通 `OPFS` 模式与 fallback 内存模式
- 提供浏览器文件导入导出能力

主要产出：

- `src/runtime-browser/client`
- `src/runtime-browser/worker`
- `src/runtime-browser/sqlite`
- `src/runtime-browser/fs`
- `examples/browser`

### 3.6 角色 F：Electron Runtime Agent

职责：

- 实现 Electron SQLite 驱动
- 设计主进程数据库服务与 IPC 协议
- 实现本地文件读写、创建、备份能力

主要产出：

- `src/runtime-electron/sqlite`
- `src/runtime-electron/ipc`
- `src/runtime-electron/fs`
- `examples/electron`

### 3.7 角色 G：QA & Compatibility Agent

职责：

- 设计单元测试、集成测试、跨运行时测试
- 建立 `udbx4j` 对照验证机制
- 维护测试数据、golden files 和回归套件

主要产出：

- `tests/unit`
- `tests/integration`
- `tests/browser`
- `tests/electron`
- 兼容性报告

### 3.8 角色 H：DevEx & Release Agent

职责：

- 搭建构建脚本、测试脚本、类型检查和发布脚本
- 处理 `sqlite3.wasm`、Worker 资源、Electron 原生依赖的构建问题
- 输出开发说明和示例运行说明

主要产出：

- `package.json`
- `tsconfig.json`
- 构建配置
- CI 脚本
- README 与开发指引

---

## 4. 协作方式与依赖规则

### 4.1 共享契约

以下内容必须先由 Technical Lead Agent 和相关负责人共同冻结，再允许大规模并行开发：

- 核心目录结构
- `DatasetInfo` / `FieldInfo` / `DatasetKind`
- `SqlDriver` / `SqlStatement`
- GAIA codec 基础接口
- Browser Worker RPC 协议
- Electron IPC 协议

### 4.2 并行原则

允许并行：

- 工程骨架与测试基础设施
- 核心类型与 GAIA codec 基础设施
- 浏览器端运行时壳层与 Electron 端运行时壳层
- 测试夹具整理与 golden files 准备

不允许在契约未稳定前大规模并行：

- 数据集实现
- 浏览器 Worker RPC 细节
- Electron IPC 细节
- 系统表写入逻辑

### 4.3 合并原则

- 所有角色先提交接口与伪实现，再补功能
- 合并顺序遵循“抽象优先于实现”
- 涉及跨角色文件的改动必须先同步接口契约

---

## 5. 阶段实施计划

### 阶段 0：准备与基线冻结

目标：

- 建立统一工作语言、目录边界、交付标准
- 冻结第一批接口契约
- 准备参考资料和测试输入

负责人：

- Technical Lead Agent
- Core Architecture Agent
- QA & Compatibility Agent
- DevEx & Release Agent

输入：

- [TECHNICAL_PLAN.md](/Users/zhangyuting/github/zhyt1985/udbx4ts/TECHNICAL_PLAN.md)
- `udbx4j` 参考实现

输出：

- 仓库目录约定
- 核心接口草案
- 阶段任务分配表
- 测试数据清单

完成定义：

- 团队对目录、命名、接口和关键依赖达成一致
- 没有未决的一级架构分歧

### 阶段 1：工程骨架与开发基础设施

目标：

- 初始化单包工程
- 建立核心源码目录、测试目录、示例目录
- 打通基础构建、类型检查和测试命令

负责人：

- DevEx & Release Agent 主责
- Core Architecture Agent 配合

可并行子任务：

- 初始化 `package.json`、`tsconfig.json`
- 建立 `src/core`、`src/runtime-browser`、`src/runtime-electron`
- 配置 `vitest`
- 配置浏览器测试与 Electron 测试脚手架
- 建立 `examples/browser` 与 `examples/electron`

输出：

- 最小可运行工程
- 构建脚本
- 测试脚本
- 空实现入口

完成定义：

- `typecheck` 可运行
- `test` 可运行
- 浏览器 Worker 和 Electron 示例项目可启动空壳

### 阶段 2：核心契约与二进制基础设施

目标：

- 落实核心类型与 SQL 抽象
- 实现二进制读写基础设施
- 为 GAIA codec 和数据集实现提供稳定底座

负责人：

- Core Architecture Agent
- Codec Agent

可并行子任务：

- 定义 `DatasetKind`、`DatasetInfo`、`FieldInfo`
- 定义 `SqlDriver`、`SqlStatement`
- 实现 `BinaryCursor`
- 实现 `BinaryWriter`
- 建立 codec 错误类型

输出：

- 核心类型模块
- SQL 抽象模块
- 二进制工具模块
- 单元测试

完成定义：

- 核心接口在团队内冻结
- 二进制工具具备稳定单元测试覆盖

### 阶段 3：GAIA codec 内核

目标：

- 完成 2D/3D Point、Line、Polygon 的 GAIA 编解码
- 建立自动识别入口和 golden bytes 回归测试

负责人：

- Codec Agent 主责
- QA & Compatibility Agent 配合

前置依赖：

- 阶段 2 完成

可并行子任务：

- Header 解析器
- 2D Point / PointZ 编解码
- MultiLineString / MultiLineStringZ 编解码
- MultiPolygon / MultiPolygonZ 编解码
- `udbx4j` 对照测试生成

输出：

- `src/core/geometry/gaia`
- `tests/unit/gaia`
- golden bytes fixtures

完成定义：

- 已支持的 `geoType` 编解码单测全部通过
- 与 `udbx4j` 的关键样例达到字节级一致或有明确差异说明

### 阶段 4：系统表与数据源初始化

目标：

- 建立新建 UDBX 的最小系统表
- 完成注册表与字段元数据仓储
- 打通“创建空库并注册数据集”的能力

负责人：

- Schema Agent 主责
- Core Architecture Agent 配合
- QA & Compatibility Agent 配合

前置依赖：

- 阶段 2 完成

可并行子任务：

- 梳理系统表最小集合
- 实现 schema initializer
- 实现 `SmRegister` 仓储
- 实现 `SmFieldInfo` 仓储
- 输出系统表兼容性测试

输出：

- `src/core/schema`
- 元数据仓储
- 新建库集成测试

完成定义：

- 可以创建最小可用 UDBX
- 新建库系统表结构与参考实现一致

### 阶段 5：核心数据源与 2D 数据集闭环

目标：

- 完成 `UdbxDataSource`
- 完成 Point / Line / Region 数据集读写
- 实现流式读取和批量写入基础能力

负责人：

- Core Architecture Agent 主责
- Schema Agent 配合
- Codec Agent 配合

前置依赖：

- 阶段 3 完成
- 阶段 4 完成

可并行子任务：

- `UdbxDataSource` 打开、创建、关闭
- 数据集工厂分派
- PointDataset
- LineDataset
- RegionDataset
- 查询映射
- `AsyncIterable` 流式读取

输出：

- `src/core/datasource`
- `src/core/dataset`
- 集成测试

完成定义：

- 能打开 `SampleData.udbx`
- 能列出并读取点线面
- 能创建新数据集并写入基础要素

### 阶段 6：浏览器运行时闭环

目标：

- 打通 `SQLite WASM + Worker + OPFS`
- 支持 fallback 内存模式
- 完成浏览器文件导入导出

负责人：

- Browser Runtime Agent 主责
- DevEx & Release Agent 配合
- QA & Compatibility Agent 配合

前置依赖：

- 阶段 1 完成
- 阶段 5 可用

可并行子任务：

- Worker 启动与 RPC
- `sqlite3.wasm` 装载
- OPFS 打开和持久化
- fallback 内存模式
- 文件导入
- 文件导出
- 浏览器示例页面

输出：

- 浏览器运行时模块
- 浏览器示例应用
- 浏览器集成测试

完成定义：

- 浏览器可打开已有 `.udbx`
- 浏览器可读取点线面数据
- 浏览器可导出修改后的数据库
- 在无 `OPFS` 情况下基础功能可用

### 阶段 7：Electron 运行时闭环

目标：

- 实现本地文件数据库访问
- 完成主进程数据库服务和渲染进程调用链
- 提供创建、打开、保存和备份能力

负责人：

- Electron Runtime Agent 主责
- DevEx & Release Agent 配合
- QA & Compatibility Agent 配合

前置依赖：

- 阶段 1 完成
- 阶段 5 可用

可并行子任务：

- SQLite 驱动适配
- 主进程服务层
- IPC 协议
- 文件打开与创建
- 备份与安全关闭
- Electron 示例应用

输出：

- Electron 运行时模块
- Electron 示例应用
- Electron 集成测试

完成定义：

- Electron 可直接打开本地 `.udbx`
- Electron 可创建新库并写入要素
- Electron 可备份并重新打开数据库

### 阶段 8：稳定化与文档交付

目标：

- 收敛跨平台行为差异
- 补全开发文档、用户示例、回归测试
- 形成可持续迭代基线

负责人：

- Technical Lead Agent
- QA & Compatibility Agent
- DevEx & Release Agent

可并行子任务：

- 回归测试收敛
- API 文档补全
- 示例文档补全
- 风险项复盘
- 下一阶段扩展项排序

输出：

- 稳定版 README
- 已知问题清单
- 发布说明
- 后续迭代计划

完成定义：

- 文档、示例和测试覆盖可支撑外部开发者接入
- 当前阶段高优先级缺陷清零或都有明确限制说明

---

## 6. 任务清单

下面的任务清单采用“任务 ID + 负责人 + 前置依赖 + 交付物 + 完成定义”的形式，供 agent team 逐项认领与执行。

### 6.1 基础工程任务

`BOOT-001` 初始化 TypeScript 单包工程  
负责人：DevEx & Release Agent  
前置依赖：无  
交付物：`package.json`、`tsconfig.json`、基础目录  
完成定义：工程能安装依赖并执行空构建

`BOOT-002` 建立导出入口与目录骨架  
负责人：Core Architecture Agent  
前置依赖：`BOOT-001`  
交付物：`src/index.ts`、`src/core`、`src/runtime-browser`、`src/runtime-electron`  
完成定义：目录边界明确，空入口可编译

`BOOT-003` 配置测试与质量脚本  
负责人：DevEx & Release Agent  
前置依赖：`BOOT-001`  
交付物：`vitest`、lint/typecheck/test 脚本  
完成定义：测试命令可执行

`BOOT-004` 建立浏览器与 Electron 示例壳  
负责人：DevEx & Release Agent  
前置依赖：`BOOT-002`  
交付物：`examples/browser`、`examples/electron`  
完成定义：示例工程能启动空页面或空窗口

### 6.2 核心契约任务

`CORE-001` 定义基础类型系统  
负责人：Core Architecture Agent  
前置依赖：`BOOT-002`  
交付物：`DatasetKind`、`DatasetInfo`、`FieldInfo`、基础 feature 类型  
完成定义：核心类型被团队确认并冻结

`CORE-002` 定义 SQL 抽象接口  
负责人：Core Architecture Agent  
前置依赖：`BOOT-002`  
交付物：`SqlDriver`、`SqlStatement`、`SqlOpenTarget`  
完成定义：浏览器端和 Electron 端均可据此实现

`CORE-003` 定义数据集抽象接口  
负责人：Core Architecture Agent  
前置依赖：`CORE-001`、`CORE-002`  
交付物：`Dataset`、`ReadableDataset`、`WritableDataset`  
完成定义：点线面数据集都可按该抽象落地

### 6.3 Codec 任务

`CODEC-001` 实现 `BinaryCursor`  
负责人：Codec Agent  
前置依赖：`BOOT-002`  
交付物：二进制读取工具  
完成定义：支持 LE 数值读取、游标移动、越界保护

`CODEC-002` 实现 `BinaryWriter`  
负责人：Codec Agent  
前置依赖：`BOOT-002`  
交付物：二进制写入工具  
完成定义：支持动态扩容和顺序写入

`CODEC-003` 实现 GAIA header 解析  
负责人：Codec Agent  
前置依赖：`CODEC-001`  
交付物：header parser 与校验器  
完成定义：能校验起止标记、byte order、SRID、MBR、geoType

`CODEC-004` 实现 2D/3D Point 编解码  
负责人：Codec Agent  
前置依赖：`CODEC-002`、`CODEC-003`  
交付物：Point / PointZ codec  
完成定义：与 golden bytes 一致

`CODEC-005` 实现 2D/3D Line 编解码  
负责人：Codec Agent  
前置依赖：`CODEC-002`、`CODEC-003`  
交付物：MultiLineString / MultiLineStringZ codec  
完成定义：与参考样例一致

`CODEC-006` 实现 2D/3D Polygon 编解码  
负责人：Codec Agent  
前置依赖：`CODEC-002`、`CODEC-003`  
交付物：MultiPolygon / MultiPolygonZ codec  
完成定义：与参考样例一致

`CODEC-007` 建立 codec registry 与自动识别入口  
负责人：Codec Agent  
前置依赖：`CODEC-004`、`CODEC-005`、`CODEC-006`  
交付物：统一读写入口  
完成定义：调用方不再手动分发 `geoType`

`CODEC-008` 建立 golden bytes 测试与 `udbx4j` 对照测试  
负责人：QA & Compatibility Agent  
前置依赖：`CODEC-004`、`CODEC-005`、`CODEC-006`  
交付物：fixtures 与测试套件  
完成定义：关键几何样例可自动回归验证

### 6.4 Schema 任务

`SCHEMA-001` 梳理最小系统表集合  
负责人：Schema Agent  
前置依赖：无  
交付物：系统表清单与字段说明  
完成定义：创建空库所需表全部明确

`SCHEMA-002` 实现 schema initializer  
负责人：Schema Agent  
前置依赖：`SCHEMA-001`、`CORE-002`  
交付物：建表初始化逻辑  
完成定义：可创建最小可用 UDBX

`SCHEMA-003` 实现 `SmRegister` 仓储  
负责人：Schema Agent  
前置依赖：`SCHEMA-002`  
交付物：注册表读写逻辑  
完成定义：支持按名称查询与注册数据集

`SCHEMA-004` 实现 `SmFieldInfo` 仓储  
负责人：Schema Agent  
前置依赖：`SCHEMA-002`  
交付物：字段元数据读写逻辑  
完成定义：支持数据集字段查询与登记

`SCHEMA-005` 建立新建库兼容性测试  
负责人：QA & Compatibility Agent  
前置依赖：`SCHEMA-002`、`SCHEMA-003`、`SCHEMA-004`  
交付物：系统表集成测试  
完成定义：新建库与参考实现元信息一致

### 6.5 核心数据源任务

`DATA-001` 实现 `UdbxDataSource.open/create/close`  
负责人：Core Architecture Agent  
前置依赖：`CORE-002`、`SCHEMA-002`、`SCHEMA-003`  
交付物：数据源入口  
完成定义：可打开已有库与创建新库

`DATA-002` 实现数据集工厂分派  
负责人：Core Architecture Agent  
前置依赖：`DATA-001`、`CORE-003`  
交付物：按 `DatasetKind` 返回具体数据集  
完成定义：点线面数据集可正确实例化

`DATA-003` 实现 PointDataset  
负责人：Core Architecture Agent  
前置依赖：`DATA-002`、`CODEC-004`  
交付物：点数据集读写  
完成定义：支持读取、按 ID 查询、流式遍历、写入

`DATA-004` 实现 LineDataset  
负责人：Core Architecture Agent  
前置依赖：`DATA-002`、`CODEC-005`  
交付物：线数据集读写  
完成定义：支持读取、流式遍历、写入

`DATA-005` 实现 RegionDataset  
负责人：Core Architecture Agent  
前置依赖：`DATA-002`、`CODEC-006`  
交付物：面数据集读写  
完成定义：支持读取、流式遍历、写入

`DATA-006` 实现批量写入与流式读取基础能力  
负责人：Core Architecture Agent  
前置依赖：`DATA-003`、`DATA-004`、`DATA-005`  
交付物：通用数据访问能力  
完成定义：点线面数据集都支持统一模式

`DATA-007` 建立 `SampleData.udbx` 集成测试  
负责人：QA & Compatibility Agent  
前置依赖：`DATA-003`、`DATA-004`、`DATA-005`  
交付物：集成测试套件  
完成定义：可稳定读取样例数据集

### 6.6 浏览器运行时任务

`WEB-001` 设计 Worker RPC 协议  
负责人：Browser Runtime Agent  
前置依赖：`CORE-001`、`CORE-002`  
交付物：请求响应协议  
完成定义：最小命令集可覆盖打开、查询、导出

`WEB-002` 集成 `sqlite3.wasm`  
负责人：Browser Runtime Agent  
前置依赖：`BOOT-001`  
交付物：WASM 装载逻辑  
完成定义：Worker 中可创建 SQLite 数据库

`WEB-003` 实现 OPFS 模式  
负责人：Browser Runtime Agent  
前置依赖：`WEB-002`  
交付物：OPFS 持久化支持  
完成定义：数据库可在浏览器会话间持久化

`WEB-004` 实现 fallback 内存模式  
负责人：Browser Runtime Agent  
前置依赖：`WEB-002`  
交付物：无 OPFS 情况下的可用模式  
完成定义：基础读写流程不依赖 OPFS

`WEB-005` 实现文件导入与导出  
负责人：Browser Runtime Agent  
前置依赖：`WEB-003`、`WEB-004`  
交付物：文件加载与保存能力  
完成定义：用户可导入 `.udbx` 并导出当前数据库

`WEB-006` 接入核心数据源到浏览器 Worker  
负责人：Browser Runtime Agent  
前置依赖：`DATA-001`、`DATA-006`、`WEB-001`、`WEB-002`  
交付物：浏览器数据源实现  
完成定义：主线程可通过 API 操作 UDBX

`WEB-007` 构建浏览器示例与测试  
负责人：QA & Compatibility Agent  
前置依赖：`WEB-005`、`WEB-006`  
交付物：浏览器 Demo 与自动化测试  
完成定义：浏览器闭环可演示、可自动验证

### 6.7 Electron 运行时任务

`ELEC-001` 设计 Electron IPC 协议  
负责人：Electron Runtime Agent  
前置依赖：`CORE-001`、`CORE-002`  
交付物：IPC 消息协议  
完成定义：最小命令集覆盖打开、查询、写入、备份

`ELEC-002` 实现 SQLite 驱动适配  
负责人：Electron Runtime Agent  
前置依赖：`CORE-002`  
交付物：`better-sqlite3` 适配层  
完成定义：实现 `SqlDriver` 契约

`ELEC-003` 实现主进程数据库服务  
负责人：Electron Runtime Agent  
前置依赖：`ELEC-001`、`ELEC-002`  
交付物：主进程服务模块  
完成定义：渲染进程不直接接触数据库连接

`ELEC-004` 接入核心数据源到 Electron  
负责人：Electron Runtime Agent  
前置依赖：`DATA-001`、`DATA-006`、`ELEC-003`  
交付物：Electron 数据源实现  
完成定义：Electron 可调用核心层读写 UDBX

`ELEC-005` 实现文件打开、创建、备份与关闭  
负责人：Electron Runtime Agent  
前置依赖：`ELEC-004`  
交付物：文件生命周期管理  
完成定义：文件操作闭环完整

`ELEC-006` 构建 Electron 示例与测试  
负责人：QA & Compatibility Agent  
前置依赖：`ELEC-004`、`ELEC-005`  
交付物：Electron Demo 与集成测试  
完成定义：Electron 闭环可演示、可自动验证

### 6.8 文档与发布任务

`DX-001` 编写开发环境说明  
负责人：DevEx & Release Agent  
前置依赖：`BOOT-001`、`BOOT-003`  
交付物：开发说明文档  
完成定义：新成员可按文档启动项目

`DX-002` 编写浏览器运行时使用说明  
负责人：DevEx & Release Agent  
前置依赖：`WEB-006`  
交付物：Web API 使用文档  
完成定义：示例和 API 能对应起来

`DX-003` 编写 Electron 运行时使用说明  
负责人：DevEx & Release Agent  
前置依赖：`ELEC-004`  
交付物：Electron API 使用文档  
完成定义：示例和 API 能对应起来

`DX-004` 形成首版发布基线  
负责人：Technical Lead Agent  
前置依赖：`WEB-007`、`ELEC-006`、`DX-001`、`DX-002`、`DX-003`  
交付物：发布说明、版本计划、风险说明  
完成定义：具备内部发布条件

---

## 7. 并行执行建议

### 7.1 第一波并行

可同时启动：

- `BOOT-001`
- `BOOT-003`
- `SCHEMA-001`
- `CODEC-001`
- `CODEC-002`

目标：

- 尽快准备基础设施与参考边界

### 7.2 第二波并行

在 `BOOT-002`、`CORE-001`、`CORE-002` 明确后，同时启动：

- `CORE-003`
- `CODEC-003`
- `WEB-001`
- `ELEC-001`
- `BOOT-004`

目标：

- 冻结契约，减少后续返工

### 7.3 第三波并行

在二进制基础设施和契约稳定后，同时启动：

- `CODEC-004`
- `CODEC-005`
- `CODEC-006`
- `SCHEMA-002`
- `SCHEMA-003`
- `SCHEMA-004`

目标：

- 让 codec 和 schema 两条主线并行推进

### 7.4 第四波并行

在核心数据源已可用后，同时启动：

- `WEB-002`
- `WEB-003`
- `WEB-004`
- `ELEC-002`
- `ELEC-003`
- `DATA-003`
- `DATA-004`
- `DATA-005`

目标：

- 浏览器、Electron、核心数据集三条线并行收敛

---

## 8. 管理节奏建议

### 8.1 例会节奏

建议每个开发日维护以下节奏：

- 日初：Technical Lead Agent 更新阻塞和任务分派
- 日中：各角色同步接口变更与风险
- 日末：QA & Compatibility Agent 汇总测试状态与回归结果

### 8.2 状态标记

每个任务统一使用以下状态：

- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`

### 8.3 阻塞升级规则

以下问题必须立即升级给 Technical Lead Agent：

- 核心接口需要破坏性修改
- `udbx4j` 对照结果与实现逻辑冲突
- 浏览器 `OPFS` 链路无法稳定工作
- Electron 原生依赖无法在目标环境构建

---

## 9. 验收口径

### 9.1 阶段验收

每个阶段完成时必须同时满足：

- 代码已合并
- 对应测试已补齐
- 示例已可运行
- 已知限制已记录

### 9.2 项目首版验收

项目首版完成的最低标准：

- 浏览器可打开、读取、修改并导出 `.udbx`
- Electron 可打开、创建、写入并备份 `.udbx`
- 点线面 2D 数据集闭环可用
- 与 `udbx4j` 的关键兼容性测试通过
- 有可持续迭代的工程骨架、测试体系和文档体系

---

## 10. 最终建议

执行上不要把 agent team 组织成“按平台完全分裂”的三支队伍，而应该组织成：

- 一条核心内核主线
- 两条运行时落地主线
- 一条测试与发布保障主线

也就是说：

- `Core Architecture Agent + Codec Agent + Schema Agent` 负责通用能力
- `Browser Runtime Agent + Electron Runtime Agent` 负责平台闭环
- `QA & Compatibility Agent + DevEx & Release Agent` 负责质量与交付
- `Technical Lead Agent` 负责节奏、决策和接口冻结

这种组织方式最适合当前项目，因为真正的高风险不是 UI，也不是平台壳层，而是 **GAIA 兼容性、系统表一致性和跨运行时执行模型的收敛**。
