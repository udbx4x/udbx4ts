import type { SqlDriver, SqlStatement, SqlValue } from "./SqlDriver";

export async function queryAll<T>(
  driver: SqlDriver,
  sql: string,
  params?: readonly SqlValue[]
): Promise<T[]> {
  const statement = await driver.prepare(sql);

  try {
    if (params) {
      await statement.bind(params);
    }

    const rows: T[] = [];
    while (await statement.step()) {
      rows.push(await statement.getRow<T>());
    }

    return rows;
  } finally {
    await statement.finalize();
  }
}

export async function queryOne<T>(
  driver: SqlDriver,
  sql: string,
  params?: readonly SqlValue[]
): Promise<T | null> {
  const rows = await queryAll<T>(driver, sql, params);
  return rows[0] ?? null;
}

export async function executeStatement(
  statement: SqlStatement,
  params?: readonly SqlValue[]
): Promise<void> {
  try {
    if (params) {
      await statement.bind(params);
    }

    await statement.step();
  } finally {
    await statement.finalize();
  }
}

export async function executeSql(
  driver: SqlDriver,
  sql: string,
  params?: readonly SqlValue[]
): Promise<void> {
  const statement = await driver.prepare(sql);
  await executeStatement(statement, params);
}

