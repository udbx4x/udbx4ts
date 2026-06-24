# AGENTS.md

本文件是 `udbx4ts` 子项目的智能体执行入口。根目录 `../AGENTS.md` 是全工作区总规则；本文件只补充 TypeScript SDK 的项目事实、命令、架构约束和测试约定。

## 项目定位

`udbx4ts` 的目标是在 Web 浏览器、Node.js 和 Electron 环境中，用 TypeScript 实现 UDBX 空间数据库的读写、查询和流式处理能力，并发布为 npm 包。

当前项目不考虑：

- React Native。
- 服务端代理模式。
- 与当前阶段无关的新平台扩展。
- 无规划地拆成 monorepo。

任何公开 API、格式语义、枚举值、字段映射或跨语言行为变更，必须先更新 `udbx4spec`，再修改 TypeScript 实现。

## 必读文档

1. `../AGENTS.md`：全工作区原则和决策优先级。
2. `README.md` / `README.en.md`：用户入口和 API 示例。
3. `CHANGELOG.md`：版本变化。
4. `udbx4spec-compliance-report.md`：规范合规状态。
5. `examples/browser/README.md`：浏览器示例。
6. `examples/electron/README.md`：Electron 示例。

## 构建与测试命令

```bash
npm install
npm run typecheck
npm test
npx vitest run tests/unit/datasource-point.spec.ts
npx vitest run -t "inserts a point feature"
npm run test:browser
npm run build
npm run dev:browser
npm run bench:real-samples
```

日常开发最低检查：

```bash
npm run typecheck
npm test
npm run build
```

真实样本性能基线：

```bash
npm run bench:real-samples
```

发布前完整门禁以根目录 `../RELEASE.md` 为准，必须包含 `udbx4spec` 合规资产校验、TypeScript 集成合规测试和 `npm pack --dry-run`。

涉及浏览器运行时的变更还必须运行：

```bash
npm run test:browser
```

## 架构基线

`udbx4ts` 使用 `Core + Runtime` 架构：

- `src/core/`：平台无关领域逻辑。
- `src/shared-runtime/`：浏览器和 Electron 共享的 RPC 协议与传输抽象。
- `src/runtime-browser/`：SQLite WASM、Web Worker、OPFS、浏览器客户端代理。
- `src/runtime-electron/`：基于 `better-sqlite3` 的 Electron 运行时。

单个 npm 包提供多入口：

- `udbx4ts` -> `src/index.ts`
- `udbx4ts/web` -> `src/runtime-browser/index.ts`
- `udbx4ts/electron` -> `src/runtime-electron/index.ts`

## 核心目录职责

- `src/core/dataset/`：`PointDataset`、`LineDataset`、`RegionDataset`、`TabularDataset`、三维数据集、`TextDataset`、`CadDataset` 等数据集实现。
- `src/core/geometry/gaia/`：GAIA 二进制几何 codec，处理 2D/3D Point、MultiLineString、MultiPolygon。
- `src/core/geometry/jsts/`：可选 JSTS 适配器，如 `toJsts`、`fromJsts`、`JstsGeometryCodec`。
- `src/core/schema/`：`SmRegisterRepository`、`SmFieldInfoRepository`、schema initializer。
- `src/core/sql/`：`SqlDriver` 抽象和 SQL helpers。
- `src/core/types/`：`DatasetKind`、`FieldType`、`Geometry`、`Feature`、`QueryOptions` 等规范类型。
- `src/shared-runtime/rpc/`：RPC request/response envelope 和方法名常量。
- `src/runtime-browser/worker/`：Worker 侧 RPC dispatcher。
- `src/runtime-browser/client/`：主线程 dataset proxy。
- `src/runtime-electron/sqlite/`：`better-sqlite3` 驱动适配。

## 当前支持的数据集类型

- `PointDataset` / `PointZDataset`
- `LineDataset` / `LineZDataset`
- `RegionDataset` / `RegionZDataset`
- `TabularDataset`
- `CadDataset`：支持 CAD 最小 GeoHeader 基线，覆盖 `CadPoint`、`CadLine`、`CadRegion` 的读写和 CRUD。
- `TextDataset`：支持最小 GeoText 编解码、`SmIndexKey` 写出、CRUD 与 `createTextDataset()`，并已纳入 `udbx4spec` 三端 roundtrip 合规资产。

若新增其他 DatasetKind，必须先进入 `udbx4spec` 并补齐合规测试。调整 Text 或 CAD 合规范围时，必须同步更新 README、合规报告和跨语言能力矩阵。

## 关键约束

### 不允许

- 在 `src/core/` 依赖 DOM、Worker、Electron 或具体 SQLite 驱动。
- 在浏览器主线程直接执行数据库操作。
- 在 Electron 渲染进程直接持有数据库连接。
- 绕过 `SqlDriver` 抽象直接访问数据库。
- 在运行时层复制领域逻辑。
- 跳过跨语言兼容性验证。
- 擅自扩大技术方案范围。

### 必须做到

- 核心层保持平台无关。
- 浏览器端数据库操作只发生在 Worker 内。
- 浏览器端采用 `SQLite WASM + Worker + OPFS` 主路线，并支持无 OPFS fallback。
- Electron 端采用原生 SQLite 驱动。
- 所有公开 API 保持异步。
- 所有批量写入使用事务和 prepared statement 复用。
- GAIA 实现建立在统一二进制工具和 codec registry 之上。
- 重要改动补齐测试。

## Canonical Types

`FieldType` 必须支持 14 个规范值：

```text
boolean, byte, int16, int32, int64, single, double, date, binary, geometry, char, ntext, text, time
```

`DatasetKind` 必须与 `udbx4spec` 同步：

```text
tabular, point, line, region, text, pointZ, lineZ, regionZ, cad
```

## 测试结构

- `tests/unit/`：核心模块和浏览器工具单元测试。
- `tests/integration/`：使用 `NodeSqliteDriver` 的端到端集成测试。
- `tests/browser/`：浏览器示例的 Playwright smoke tests。
- `tests/support/NodeSqliteDriver.ts`：测试用 Node.js SQLite driver。

GitHub Actions 应运行：

- `npm run typecheck`
- `npm test`
- `npm run build`
- 浏览器 smoke tests

## udbx4spec 合规要求

- API 命名必须与 `../udbx4spec/docs/01-naming-conventions.md` 对齐。
- 几何模型必须符合 `../udbx4spec/docs/02-geometry-model.md`。
- 数据集类型必须与 `../udbx4spec/docs/03-dataset-taxonomy.md` 同步。
- 字段类型必须与 `../udbx4spec/docs/04-field-taxonomy.md` 同步。
- API、DatasetKind、FieldType 或格式语义变更必须先更新 `udbx4spec`。

## 任务执行方式

- 先识别任务属于 `core`、`runtime-browser`、`runtime-electron`、`shared-runtime`、`examples` 还是 `tests`。
- 只修改任务边界内文件。
- 需要改公共契约时，先更新规范或说明影响范围。
- 不跨模块大范围重写。
- 不在契约未冻结前并行开发强依赖模块。

## 完成任务前自检

1. 是否符合根目录 `../AGENTS.md` 的工作原则。
2. 是否保持 core/runtime 分层。
3. 是否补齐测试或明确说明未补原因。
4. 是否引入计划外平台或范围。
5. 是否影响跨语言规范或其他 SDK。
6. 是否需要更新 README、CHANGELOG 或合规报告。

## 冲突处理

优先级从高到低：

1. 当前用户明确要求。
2. 根目录 `../AGENTS.md`。
3. 本文件。
4. `../udbx4spec/docs/`。
5. `README.md`。

如果发现文档之间冲突，不要自行猜测扩展方向；先修订规范或说明冲突，再实现。
