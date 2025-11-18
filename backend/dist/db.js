"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDatabase = verifyDatabase;
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = __importDefault(require("mysql2/promise"));
dotenv_1.default.config();
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'appuser',
    password: process.env.DB_PASSWORD ?? 'appsecret',
    database: process.env.DB_NAME ?? 'PT_Clinic',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? '10'),
    namedPlaceholders: true,
});
async function verifyDatabase() {
    const [rows] = await pool.query("SELECT DATABASE() AS db");
    const firstRow = rows.length > 0 ? rows[0] : undefined;
    return firstRow?.db;
}
exports.default = pool;
//# sourceMappingURL=db.js.map