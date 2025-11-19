"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDatabase = verifyDatabase;
exports.ensureUsersTable = ensureUsersTable;
exports.ensureReferralsConstraint = ensureReferralsConstraint;
exports.ensureSessionsSchema = ensureSessionsSchema;
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
const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Users (
  UserID INT PRIMARY KEY AUTO_INCREMENT,
  Username VARCHAR(60) NOT NULL UNIQUE,
  PasswordHash VARBINARY(255) NOT NULL,
  PasswordSalt VARBINARY(255) NOT NULL,
  Role ENUM('pending','patient','therapist','admin') NOT NULL DEFAULT 'pending',
  PatientID INT NULL UNIQUE,
  TherapistID INT NULL UNIQUE,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_patient
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_users_therapist
    FOREIGN KEY (TherapistID) REFERENCES Therapist(StaffID)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;
`;
async function verifyDatabase() {
    const [rows] = await pool.query('SELECT DATABASE() AS db');
    const firstRow = rows.length > 0 ? rows[0] : undefined;
    return firstRow?.db;
}
async function ensureUsersTable() {
    await pool.query(CREATE_USERS_TABLE_SQL);
    const [roleColumn] = await pool.query(`SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Users'
       AND COLUMN_NAME = 'Role'
     LIMIT 1`);
    const columnType = roleColumn[0]?.COLUMN_TYPE ?? '';
    if (!columnType.includes("'pending'")) {
        await pool.query("ALTER TABLE Users MODIFY Role ENUM('pending','patient','therapist','admin') NOT NULL DEFAULT 'pending'");
    }
}
async function ensureReferralsConstraint() {
    try {
        await pool.query('ALTER TABLE Referrals DROP CHECK chk_ref_one_source');
    }
    catch (error) {
        const mysqlError = error;
        if (mysqlError?.code === 'ER_BAD_CHECK_DROP_FIELD_ERROR' ||
            mysqlError?.code === 'ER_CHECK_CONSTRAINT_NOT_FOUND' ||
            mysqlError?.errno === 3940 ||
            mysqlError?.errno === 3821) {
            // Constraint does not exist; nothing to do.
            return;
        }
        if (mysqlError?.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            return;
        }
        throw error;
    }
}
async function ensureSessionsSchema() {
    const [sessionTimeColumn] = await pool.query(`SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Sessions'
       AND COLUMN_NAME = 'SessionTime'
     LIMIT 1`);
    if (sessionTimeColumn.length === 0) {
        await pool.query("ALTER TABLE Sessions ADD COLUMN SessionTime TIME NULL AFTER SessionDate");
        await pool.query("UPDATE Sessions SET SessionTime = '08:00:00' WHERE SessionTime IS NULL");
        await pool.query("ALTER TABLE Sessions MODIFY SessionTime TIME NOT NULL");
    }
    const [therapistSlotConstraint] = await pool.query(`SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Sessions'
       AND CONSTRAINT_NAME = 'uq_therapist_slot'
     LIMIT 1`);
    if (therapistSlotConstraint.length === 0) {
        await pool.query('ALTER TABLE Sessions ADD CONSTRAINT uq_therapist_slot UNIQUE (TherapistID, SessionDate, SessionTime)');
    }
    try {
        await pool.query("ALTER TABLE Sessions ADD CONSTRAINT chk_session_time CHECK (SessionTime BETWEEN '08:00:00' AND '16:00:00')");
    }
    catch (error) {
        const mysqlError = error;
        if (mysqlError?.code !== 'ER_DUP_KEYNAME' &&
            mysqlError?.code !== 'ER_CANT_CREATE_MORE_THAN_ONE_TRG' &&
            mysqlError?.code !== 'ER_CHECK_CONSTRAINT_DUP_NAME' &&
            mysqlError?.errno !== 3822) {
            // MySQL uses ER_DUP_KEYNAME for duplicate constraint names.
            throw error;
        }
    }
}
exports.default = pool;
//# sourceMappingURL=db.js.map