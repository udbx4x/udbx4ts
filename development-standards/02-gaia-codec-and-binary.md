# GAIA 编解码与二进制实现规范

## 1. 目的

本规范用于约束 GAIA 几何编解码、二进制工具和相关错误处理的实现方式，确保与 UDBX 和 `udbx4j` 兼容。

## 2. 优先级

GAIA codec 是当前项目的最高优先级技术内核。任何智能体在实现数据集读写前，必须优先遵守本规范。

## 3. 基础设施规则

GAIA 实现必须建立在统一的二进制基础设施上：

- `BinaryCursor`
- `BinaryWriter`
- Header 解析与校验工具
- 统一 codec registry

禁止以下做法：

- 每种几何类型各自手写一套 `DataView` 访问逻辑
- 在数据集类中直接解析 GAIA 二进制
- 把 Header 解析逻辑复制到多个 codec 文件中

## 4. Header 规则

GAIA Header 的解析必须统一处理：

- `gaiaStart`
- `byteOrder`
- `srid`
- `mbr`
- `gaiaMBR`
- `geoType`
- `gaiaEnd`

必须满足：

- 对起止标记做严格校验
- 明确使用 Little-Endian
- 解析失败时给出可区分的错误类型

禁止：

- 遇到非法头部时静默容错
- 省略 `geoType` 校验
- 以“只要能读出来就行”为原则跳过格式检查

## 5. codec 注册与分派规则

GAIA 编解码必须通过统一注册机制按 `geoType` 分派。

必须：

- 存在自动识别读入口
- 存在统一写入口
- 明确区分 2D 与 3D `geoType`

禁止：

- 由上层调用方到处手动 `switch geoType`
- 在外部模块依赖具体 codec 文件路径

## 6. 几何实现顺序

实现顺序必须固定为：

1. `Point`
2. `PointZ`
3. `MultiLineString`
4. `MultiLineStringZ`
5. `MultiPolygon`
6. `MultiPolygonZ`

在 2D 点线面闭环未稳定前，不得优先开发：

- 性能优化型 codec 重写
- 额外几何模型扩展

## 7. 几何模型规则

内部几何模型必须保持轻量，允许接近 GeoJSON，但不得被第三方 GIS 库绑架。

允许：

- 自定义 `PointGeometry`、`LineGeometry`、`RegionGeometry`
- 附带 `srid`、`hasZ`、`bbox`、`geoType`

禁止：

- 为了编解码而强依赖大型 GIS 几何库
- 把第三方库对象作为核心层长期存储模型

## 8. 错误处理规则

GAIA 相关错误至少要区分：

- 格式损坏
- `geoType` 不匹配
- 暂不支持的几何类型
- 越界或截断数据

错误信息必须包含足够上下文，以支持定位到：

- 期望值
- 实际值
- 失败位置或字段

## 9. 测试规则

所有 codec 实现都必须至少具备以下测试：

- 单元测试
- golden bytes 测试
- 与 `udbx4j` 的对照测试

允许：

- 对编码结果做字节级断言
- 对解码结果做结构断言

禁止：

- 只测“可解析”而不测“解析是否正确”
- 只测 TypeScript 类型而不测字节内容

## 10. 性能规则

第一阶段 codec 实现优先保证正确性与可维护性。

允许：

- 明确的顺序读写
- 适度的小对象分配

禁止：

- 为了微小性能收益牺牲可读性
- 在未建立基准测试前引入复杂缓存和对象池
