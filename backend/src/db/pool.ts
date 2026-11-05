import mysql from 'mysql2/promise';
import { config } from '../config.ts';

export function createPool(options: { multipleStatements?: boolean } = {}) {
  return mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: options.multipleStatements ?? false,
  });
}

export type Pool = ReturnType<typeof createPool>;
