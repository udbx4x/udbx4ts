# udbx4ts 技术方案（第二版）

## 1. 文档目的

本文档用于指导 `udbx4ts` 项目的后续开发，定义面向 **Web 浏览器** 与 **Electron** 的统一技术路线、系统边界、模块划分、实施阶段与验证标准。

本文档替代第一版方案中的以下关键决策：

- 浏览器端不再采用 `sql.js` 全量内存模型作为主路线
- 项目初期不再以多包 Monorepo 作为默认结构
- 平台设计不再追求 React Native 等非目标运行时兼容

本方案的核心目标是：在 **TypeScript** 生态内，以较小依赖和可维护架构，实现 UDBX 空间数据库在 Web 与 Electron 环境下的稳定读写、查询、流式处理与跨平台复用。

---

## 2. 背景与目标

### 2.1 项目背景

UDBX 是基于 SQLite 的空间数据库格式，几何字段使用 GAIA 二进制编码，兼容 SpatiaLite 的几何存储风格。现有参考实现为成熟的 Java 项目 `udbx4j`，已经验证了数据模型、系统表结构、几何编解码和数据集读写逻辑。

`udbx4ts` 的任务不是机械翻译 Java 代码，而是在 TypeScript 环境中重新构建一套更适合 Web/Electron 的实现。

### 2.2 目标

- 支持在浏览器中打开、读取、查询、创建和保存 `.udbx` 文件
- 支持在 Electron 中对 `.udbx` 文件进行高性能本地读写
- 保持核心领域逻辑在不同平台之间高度复用
- 与 `udbx4j` 在系统表、GAIA 编解码和数据读写行为上保持兼容
- 为后续性能优化预留架构空间

### 2.3 非目标

以下内容不纳入第一阶段核心目标：

- React Native 或其他非 Web/Electron 运行时支持
- 完整 SpatiaLite SQL 能力复刻
- 服务端数据库代理模式
- 追求与 Java 版类结构一一对应

---

## 3. 核心技术路线

### 3.1 总体路线

项目采用以下主路线：

- **核心领域层使用纯 TypeScript 实现**
- **浏览器端使用官方 `SQLite WASM` 运行 SQLite**
- **浏览器端数据库运行在 Dedicated Worker 中**
- **浏览器端优先使用 `OPFS` 作为数据库持久化后端**
- **Electron 端使用原生 SQLite 驱动**
- **对外 API 统一采用异步接口，屏蔽不同平台执行模型差异**

一句话概括：

> `udbx4ts = TypeScript Core + Web Runtime + Electron Runtime`

### 3.2 为什么不再采用第一版主路线

第一版方案中的浏览器实现基于 `sql.js`，其主要问题是：

- 数据库文件通常需要整体装入内存
- “分块读取再拼接”无法从根本上解决大文件内存问题
- 主线程使用时容易带来 UI 阻塞
- 持久化需要额外拼装 `IndexedDB` 策略，工程复杂但仍不接近真实文件型数据库体验

而第二版路线中：

- `SQLite WASM` 直接提供浏览器内 SQLite 引擎
- `OPFS` 可为 SQLite 提供浏览器侧本地持久化文件存储
- Worker 可隔离数据库执行，避免主线程阻塞

因此，第二版的技术路线更符合本项目“Web 上也要做真正数据库处理”的目标。

---

## 4. 关键架构决策

### 4.1 仓库结构：单包多入口，而非初期 Monorepo

项目初期采用 **单 npm 包 + 子路径导出**，而不是一开始拆成 `core/browser/electron` 多包仓库。

原因：

- 当前项目为全新空仓库，过早 Monorepo 会增加构建、发布、依赖和测试复杂度
- 核心模块边界尚未完全稳定，先在单包内演进更利于快速迭代
- 子路径导出已经足够表达平台入口和内部模块边界

建议目录结构：

```text
udbx4ts/
├── src/
│   ├── core/                    # 平台无关领域内核
│   │   ├── datasource/
│   │   ├── dataset/
│   │   ├── geometry/
│   │   │   ├── gaia/
│   │   │   └── cad/
│   │   ├── schema/
│   │   ├── sql/
│   │   ├── types/
│   │   └── utils/
│   ├── runtime-browser/         # 浏览器运行时
│   │   ├── client/
│   │   ├── worker/
│   │   ├── sqlite/
│   │   └── fs/
│   ├── runtime-electron/        # Electron 运行时
│   │   ├── sqlite/
│   │   ├── ipc/
│   │   └── fs/
│   ├── shared-runtime/          # 运行时共享协议
│   │   ├── rpc/
│   │   └── transport/
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── browser/
│   ├── electron/
│   └── fixtures/
├── examples/
│   ├── browser/
│   └── electron/
├── package.json
├── tsconfig.json
└── TECHNICAL_PLAN.md
```

对外导出建议：

```json
{
  "name": "udbx4ts",
  "exports": {
    ".": "./dist/index.js",
    "./web": "./dist/runtime-browser/index.js",
    "./electron": "./dist/runtime-electron/index.js"
  }
}
```

### 4.2 核心层与运行时彻底解耦

核心层不依赖以下内容：

- DOM API
- Worker API
- Electron API
- 原生 SQLite 模块

核心层只依赖以下抽象：

- SQL 执行接口
- 二进制读写接口
- 文件元数据抽象
- 数据集与几何模型

这样可以保证：

- 浏览器 Worker 中可以直接运行核心逻辑
- Electron 主进程或 Node 环境可以直接运行核心逻辑
- 平台变化不会污染领域层设计

### 4.3 API 统一采用异步接口

虽然 Electron 端原生 SQLite 大多是同步 API，但对外公共 API 统一设计为异步：

```ts
interface UdbxDataSource {
  listDatasets(): Promise<DatasetInfo[]>;
  getDataset(name: string): Promise<Dataset | null>;
  close(): Promise<void>;
}
```

原因：

- 浏览器 Worker 通信天然异步
- 统一 API 可避免平台分裂
- Electron 端同步执行只是在实现层内部优化，不影响上层使用体验

---

## 5. 平台实现方案

### 5.1 浏览器运行时

### 5.1.1 技术选型

- SQLite 引擎：官方 `sqlite3.wasm`
- 执行位置：Dedicated Worker
- 持久化存储：`OPFS` 作为首选后端
- 文件选择与导出：
  - 优先使用 File System Access API
  - 不可用时退化为 `<input type="file">` 导入和 Blob 下载导出

### 5.1.2 设计原则

浏览器端不直接在主线程运行数据库，不直接假设用户文件可被原地修改，而是采用“工作副本”模式：

1. 用户选择 `.udbx` 文件
2. 浏览器将文件复制到站点私有工作区
3. Worker 内部在 OPFS 中打开该数据库
4. 所有读取、查询、写入都在 Worker 中执行
5. 用户显式执行“导出/保存为”时，再将工作副本写回用户文件

这种模式的优势：

- 规避主线程阻塞
- 充分利用 OPFS 的文件型持久化
- 不依赖所有浏览器都支持用户文件原地写回
- 更容易实现自动保存、崩溃恢复和草稿管理

### 5.1.3 浏览器降级策略

浏览器运行时必须支持两级能力：

- **增强模式**：`SQLite WASM + Worker + OPFS`
- **基础模式**：`SQLite WASM + Worker + 内存数据库 + 显式导入导出`

约束：

- 不允许因为 `OPFS` 不可用而导致库完全不可用
- 允许在基础模式下牺牲部分超大文件体验，但必须保证功能正确性

### 5.1.4 浏览器运行时结构

```text
主线程应用
    ↓
Web Client API
    ↓ RPC
Dedicated Worker
    ↓
BrowserSqliteDriver
    ↓
sqlite3.wasm
    ↓
OPFS / 内存数据库
```

建议划分：

- `runtime-browser/client`
  - 对外 API
  - Worker 生命周期管理
  - 传输协议封装
- `runtime-browser/worker`
  - SQLite 初始化
  - 数据源实例注册
  - 命令分发
- `runtime-browser/sqlite`
  - WASM 加载
  - OPFS 数据库打开
  - 导入、导出、备份
- `runtime-browser/fs`
  - File System Access API 封装
  - fallback 导入导出逻辑

### 5.2 Electron 运行时

### 5.2.1 技术选型

Electron 端第一阶段采用成熟的原生 SQLite 驱动，推荐：

- 首选实现：`better-sqlite3`
- 预留替代适配点：未来可评估 `node:sqlite`

该决策的原因是：

- `better-sqlite3` 在 Electron 生态更成熟
- 当前 `node:sqlite` 虽已进入官方文档，但仍处于快速演进阶段，且 Electron 对应 Node 版本可能滞后
- 对本项目而言，稳定的文件数据库能力优先于减少一个原生依赖

### 5.2.2 Electron 架构原则

建议数据库读写位于 Electron 主进程或受控后端进程中，不建议在渲染进程直接暴露数据库连接。

推荐模式：

```text
Renderer UI
   ↓ IPC
Electron Main Process
   ↓
ElectronSqliteDriver
   ↓
better-sqlite3
   ↓
.udbx file
```

这样可以：

- 降低渲染进程暴露数据库能力的安全风险
- 保持与浏览器端类似的“异步远程访问”心智模型
- 在主进程集中管理连接、事务与文件锁

### 5.2.3 Electron 文件策略

Electron 可直接对用户本地 `.udbx` 文件进行读写，因此无需浏览器中的“工作副本”约束。

但建议仍提供以下能力：

- 显式 `backup/export`
- 文件级锁和连接生命周期管理
- 崩溃恢复和 WAL 配置管理

---

## 6. 核心领域模型设计

### 6.1 数据模型原则

不照搬 Java 的重继承结构，而采用：

- 元数据驱动
- 组合优先
- 泛型数据集接口
- 轻量语义封装

### 6.2 主要类型

建议核心类型如下：

```ts
type DatasetKind =
  | "point"
  | "line"
  | "region"
  | "tabular"
  | "pointZ"
  | "lineZ"
  | "regionZ"
  | "cad";

interface DatasetInfo {
  id: number;
  name: string;
  kind: DatasetKind;
  tableName: string;
  srid: number | null;
  objectCount: number;
  geometryType: number | null;
}

interface FieldInfo {
  name: string;
  fieldType: FieldType;
  nullable: boolean;
  defaultValue?: unknown;
}
```

### 6.3 数据集抽象

推荐抽象层次：

```ts
interface Dataset {
  readonly info: DatasetInfo;
}

interface ReadableDataset<TFeature> extends Dataset {
  getById(id: number): Promise<TFeature | null>;
  list(options?: QueryOptions): Promise<TFeature[]>;
  iterate(options?: QueryOptions): AsyncIterable<TFeature>;
}

interface WritableDataset<TFeature> extends ReadableDataset<TFeature> {
  insert(feature: TFeature): Promise<void>;
  insertMany(features: Iterable<TFeature> | AsyncIterable<TFeature>): Promise<void>;
}
```

具体数据集类型如 `PointDataset`、`LineDataset`、`RegionDataset`、`PointZDataset`、`LineZDataset`、`RegionZDataset`、`CadDataset` 只承担以下职责：

- 约束几何类型
- 提供更友好的类型定义
- 注入对应的 GAIA codec

### 6.4 几何模型

内部几何模型采用轻量、自定义、接近 GeoJSON 的结构，但补足数据库场景所需字段：

- `srid`
- `hasZ`
- `bbox`
- 原始 `geoType`

示例：

```ts
interface PointGeometry {
  type: "Point";
  coordinates: [number, number] | [number, number, number];
  srid?: number;
  bbox?: [number, number, number, number];
}
```

原则：

- 不强依赖第三方 GIS 几何库
- 不在核心层引入 turf、jsts 等大型依赖
- 对外可提供与 GeoJSON 的转换工具，而不是让内部实现直接依赖 GeoJSON 规范约束

---

## 7. GAIA 编解码设计

### 7.1 总体原则

GAIA 编解码是整个项目最关键的技术内核，必须作为独立子系统设计，而不是零散写若干 `readPoint()`、`writePolygon()` 函数。

### 7.2 设计方式

建议实现以下基础设施：

- `BinaryCursor`
  - 基于 `DataView`
  - 提供位置指针、端序控制、越界检查
- `BinaryWriter`
  - 提供动态扩容和顺序写入能力
- `GaiaHeader`
  - 统一解析起始标记、字节序、SRID、MBR、geoType、结束标记
- `GaiaCodecRegistry`
  - 按 `geoType` 注册 payload 读写器

### 7.3 编解码层次

```text
GaiaGeometryCodec
  ├── parseHeader()
  ├── decodePayloadByGeoType()
  ├── encodeHeader()
  └── encodePayloadByGeometry()
```

### 7.4 实现顺序

必须按以下顺序推进：

1. 2D Point
2. 3D PointZ
3. 2D MultiLineString
4. 3D MultiLineStringZ
5. 2D MultiPolygon
6. 3D MultiPolygonZ
7. 自动识别入口
8. 编码器
9. 与 `udbx4j` 的字节级对照测试

### 7.5 关键原则

- Header 校验必须严格
- 所有 `geoType` 必须由统一注册机制分派
- 错误必须区分“格式损坏”“类型不匹配”“暂不支持”
- 编码器输出必须尽量保持与参考实现一致

---

## 8. SQL 与存储抽象

### 8.1 抽象目标

需要统一浏览器 Worker 内 SQLite 与 Electron 本地 SQLite 的差异，提供最小但足够的 SQL 能力抽象。

### 8.2 建议接口

```ts
interface SqlDriver {
  open(target: SqlOpenTarget): Promise<void>;
  close(): Promise<void>;
  exec(sql: string): Promise<void>;
  prepare(sql: string): Promise<SqlStatement>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

interface SqlStatement {
  bind(params?: SqlValue[]): Promise<void>;
  step(): Promise<boolean>;
  getRow<T = Record<string, unknown>>(): Promise<T>;
  reset(): Promise<void>;
  finalize(): Promise<void>;
}
```

说明：

- 接口使用异步形式，统一浏览器与 Electron
- Electron 内部可以同步实现再 Promise 包装
- 不在抽象层暴露平台私有特性

### 8.3 查询模型

查询层不做完整 ORM，不做 LINQ 风格 DSL，采用以下简单方式：

- 核心层内部直接使用明确 SQL
- 对外提供参数化查询接口
- 数据集层负责结果映射

原则是：**SQL 显式、映射明确、抽象克制。**

---

## 9. 系统表与 UDBX 兼容策略

### 9.1 兼容原则

与 `udbx4j` 保持以下兼容：

- 系统表结构
- 系统字段命名
- 数据集注册行为
- 几何字段存储方式
- `DatasetKind` 与 `geoType` 的对应关系

### 9.2 需要优先实现的系统表能力

- `SmRegister`
- `SmFieldInfo`
- 其他创建数据源所需的最小系统表

第一阶段不要求把所有辅助系统表一次性铺满，但必须先确认：

- 哪些表是创建新 UDBX 所必需的
- 哪些表是读取既有 UDBX 所必需的
- 哪些表可以延后初始化

### 9.3 创建新数据源策略

创建 `.udbx` 文件时必须保证：

- 系统表初始化完整且顺序确定
- 初始元信息与参考实现一致
- 新建数据集时同步更新注册表和字段元数据

---

## 10. 对外 API 设计

### 10.1 浏览器 API

建议提供显式入口：

```ts
import { createBrowserUdbx } from "udbx4ts/web";
```

核心能力：

- 打开本地文件
- 从 `Uint8Array` 导入数据库
- 列出数据集
- 获取数据集
- 导出当前数据库
- 关闭会话

### 10.2 Electron API

建议提供显式入口：

```ts
import { createElectronUdbx } from "udbx4ts/electron";
```

核心能力：

- 打开本地 `.udbx` 路径
- 创建新数据库
- 执行备份
- 获取数据集
- 安全关闭连接

### 10.3 通用 API 设计原则

- 不自动猜测运行时
- 不在入口层混入复杂环境探测逻辑
- 不使用“一个入口跑所有平台”的黑盒方案

这样能减少调试成本，也更符合 TypeScript 库的工程预期。

---

## 11. 构建、打包与发布

### 11.1 构建策略

建议使用：

- `typescript`
- `tsup` 或 `esbuild + tsc`
- `vitest`
- `playwright`

推荐目标：

- 构建 ESM 为主
- 必要时补充 CJS 兼容
- 输出 `.d.ts`

### 11.2 WASM 资源处理

浏览器构建必须明确处理：

- `sqlite3.wasm`
- Worker 脚本输出路径
- CDN 与本地资源的装载方式

建议：

- 默认本地静态资源模式
- 提供可覆盖的资源定位配置

### 11.3 发布策略

第一阶段只发布单 npm 包：

- `udbx4ts`

通过 `exports` 提供不同平台入口，而不是发布多个独立包。

---

## 12. 测试策略

### 12.1 测试原则

测试必须围绕“兼容性”和“跨运行时一致性”设计，而不是只验证 TypeScript 类型正确。

### 12.2 测试分层

#### 单元测试

覆盖以下内容：

- `BinaryCursor`
- `BinaryWriter`
- GAIA header 解析
- 各几何类型编解码
- SQL 映射逻辑
- 系统表元数据映射

#### 兼容性测试

以 `udbx4j` 为基准，重点验证：

- 同一几何对象编码后字节是否一致
- 读取同一测试库后数据是否一致
- 新建数据集后系统表记录是否一致

#### 集成测试

覆盖以下闭环：

- 打开已有 `.udbx`
- 列出数据集
- 读取点/线/面数据
- 写入并重新读取
- 导出后重新打开

#### 浏览器端测试

重点验证：

- Worker 通信
- OPFS 打开与持久化
- fallback 内存模式
- 文件导入导出

#### Electron 端测试

重点验证：

- 本地文件打开
- 并发访问与事务
- 崩溃前关闭和 WAL 行为

### 12.3 测试数据

建议优先复用 `udbx4j` 现有测试数据：

- `SampleData.udbx`
- GAIA 几何字节样例
- 系统表初始化结果样例

若 `udbx4j` 当前没有足够的 golden files，应在本项目中新增：

- 2D/3D Point golden bytes
- 2D/3D MultiLineString golden bytes
- 2D/3D MultiPolygon golden bytes

---

## 13. 性能策略

### 13.1 性能目标

第一阶段不追求极限优化，但需要保证：

- 浏览器端不会因读取中等规模 UDBX 文件而直接 OOM
- Electron 端对常见读写场景具备可接受性能
- 数据集读取支持流式消费

### 13.2 优先级最高的性能设计

优先做对的三件事：

- 浏览器端使用 Worker
- 浏览器端使用 OPFS 持久化而不是大文件反复全量内存复制
- 数据集层提供 `AsyncIterable` 流式读取

### 13.3 后续性能优化

第二阶段再考虑：

- `rbush` 空间索引
- 批量写入优化
- 编码器对象复用
- 查询缓存

原则是先保证正确性和兼容性，再做性能加速。

---

## 14. 风险与应对

### 14.1 浏览器环境复杂度

风险：

- OPFS 在不同浏览器实现细节不同
- Worker + WASM + 文件导入导出链路复杂

应对：

- 从一开始就设计基础模式 fallback
- 浏览器运行时独立做集成测试
- 不把用户文件原地写回作为默认路径

### 14.2 GAIA 解析复杂且容易出现兼容偏差

风险：

- 字节序、geoType、环结构、Z 维处理稍有偏差就会导致数据损坏

应对：

- 先搭建统一二进制 codec 内核
- 强制引入 golden bytes 测试
- 与 `udbx4j` 按字节对照验证

### 14.3 Electron 原生模块维护成本

风险：

- 原生模块需要针对 Electron ABI 处理重建

应对：

- 第一阶段固定成熟驱动与构建脚本
- 将驱动能力包裹在统一适配层中
- 保留未来切换到 `node:sqlite` 的能力

### 14.4 需求范围膨胀

风险：

- 如果一开始就同时做空间索引、复杂 UI 示例，开发周期会显著拉长

应对：

- 严格按阶段推进
- 核心数据集（2D/3D/CAD）作为主线推进
- 高级 CAD 几何类型和空间索引作为后续扩展

---

## 15. 实施阶段

### 阶段 1：基础工程与运行时骨架

目标：

- 完成单包工程初始化
- 建立 `src/core`、`src/runtime-browser`、`src/runtime-electron` 骨架
- 打通构建、单测和浏览器 Worker 打包

交付物：

- 基础工程
- 导出入口
- 浏览器 Worker 最小示例
- Electron 最小示例

### 阶段 2：GAIA codec 内核与系统表

目标：

- 实现 `BinaryCursor` / `BinaryWriter`
- 实现 GAIA Header 与 2D/3D 几何编解码
- 实现最小系统表初始化与读取

交付物：

- 几何编解码单测
- 系统表仓储
- 新建 UDBX 最小闭环

### 阶段 3：核心数据源与点线面读写

目标：

- 完成 `UdbxDataSource`
- 完成 Point / Line / Region / PointZ / LineZ / RegionZ / Cad 数据集读写
- 实现 `AsyncIterable` 流式读取

交付物：

- 读取已有 `SampleData.udbx`
- 新建库并写入点线面（含 3D 和 CAD）
- 导出并回读验证

### 阶段 4：浏览器运行时完整闭环

目标：

- Worker RPC
- OPFS 模式
- fallback 内存模式
- 文件导入导出

交付物：

- 浏览器 Demo
- Playwright 自动化测试

### 阶段 5：Electron 运行时完整闭环

目标：

- `better-sqlite3` 驱动
- 主进程数据库服务
- IPC 封装
- 文件打开、保存、备份

交付物：

- Electron Demo
- Electron 集成测试

### 阶段 6：扩展功能

目标：

- 批量写入优化
- 空间索引
- 高级 CAD 几何类型扩展

---

## 16. 验收标准

### 功能验收

- 能在浏览器中打开已有 `.udbx`
- 能在浏览器中列出并读取点线面数据集（含 3D 和 CAD）
- 能在浏览器中修改并导出 `.udbx`
- 能在 Electron 中直接打开本地 `.udbx`
- 能在 Electron 中创建新库并写入点线面要素（含 3D 和 CAD）

### 兼容性验收

- 与 `udbx4j` 的基础几何编解码结果一致
- 系统表初始化与元数据写入行为一致
- `SampleData.udbx` 可在两端正确读取

### 工程验收

- 有完整类型定义
- 有单元测试、集成测试和浏览器/Electron 运行时测试
- 有最小可运行示例

---

## 17. 最终结论

`udbx4ts` 的最优路线不是围绕 Java 实现做逐类移植，而是围绕 **TypeScript 核心内核、浏览器数据库运行时和 Electron 原生数据库运行时** 重新组织系统。

本方案的核心结论如下：

- 核心领域逻辑全部使用纯 TypeScript 实现
- 浏览器端采用 `SQLite WASM + Worker + OPFS` 为主路线
- 浏览器端必须支持无 OPFS 的基础降级模式
- Electron 端采用成熟原生 SQLite 驱动，并通过统一抽象接入核心层
- GAIA 编解码内核是全项目的第一优先级
- 项目初期采用单包多入口，避免过早 Monorepo 化

按照本方案实施，可以更稳妥地完成 Web 与 Electron 双平台目标，并为后续性能优化打下可维护的基础。
