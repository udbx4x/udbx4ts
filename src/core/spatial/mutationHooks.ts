import type { SqlDriver } from "../sql/SqlDriver";

type TableInvalidator = (tableName: string) => void;

const invalidators = new WeakMap<SqlDriver, Set<TableInvalidator>>();

/** 注册某个 DataSource 的写操作失效回调（按驱动实例隔离）。 */
export function registerMutationInvalidator(
  driver: SqlDriver,
  invalidator: TableInvalidator
): void {
  let set = invalidators.get(driver);
  if (!set) {
    set = new Set<TableInvalidator>();
    invalidators.set(driver, set);
  }
  set.add(invalidator);
}

/** 数据集写操作成功后通知所属 DataSource 使对应表缓存失效。 */
export function notifyDatasetMutation(
  driver: SqlDriver,
  tableName: string
): void {
  invalidators.get(driver)?.forEach((invalidator) => invalidator(tableName));
}
