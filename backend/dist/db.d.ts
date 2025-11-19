import mysql from 'mysql2/promise';
declare const pool: mysql.Pool;
export declare function verifyDatabase(): Promise<string | undefined>;
export declare function ensureUsersTable(): Promise<void>;
export declare function ensureReferralsConstraint(): Promise<void>;
export declare function ensureSessionsSchema(): Promise<void>;
export default pool;
//# sourceMappingURL=db.d.ts.map