import mysql from 'mysql2/promise';
declare const pool: mysql.Pool;
export declare function verifyDatabase(): Promise<string | undefined>;
export default pool;
//# sourceMappingURL=db.d.ts.map