import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '3306'),
  user: process.env.DB_USER ?? 'appuser',
  password: process.env.DB_PASSWORD ?? 'appsecret',
  database: process.env.DB_NAME ?? 'PT_Clinic',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? '10'),
  namedPlaceholders: true,
});

type DatabaseRow = RowDataPacket & { db: string };

export async function verifyDatabase(): Promise<string | undefined> {
  const [rows] = await pool.query<DatabaseRow[]>("SELECT DATABASE() AS db");
  const firstRow = rows.length > 0 ? rows[0] : undefined;
  return firstRow?.db;
}

export default pool;
