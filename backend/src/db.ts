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

type ColumnTypeRow = RowDataPacket & {
  COLUMN_TYPE: string;
};

type ColumnExistsRow = RowDataPacket & {
  COLUMN_NAME: string;
};

type ConstraintRow = RowDataPacket & {
  CONSTRAINT_NAME: string;
};

export async function verifyDatabase(): Promise<string | undefined> {
  const [rows] = await pool.query<DatabaseRow[]>('SELECT DATABASE() AS db');
  const firstRow = rows.length > 0 ? rows[0] : undefined;
  return firstRow?.db;
}

export async function ensureUsersTable(): Promise<void> {
  await pool.query(CREATE_USERS_TABLE_SQL);
  const [roleColumn] = await pool.query<ColumnTypeRow[]>(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Users'
       AND COLUMN_NAME = 'Role'
     LIMIT 1`,
  );

  const columnType = roleColumn[0]?.COLUMN_TYPE ?? '';
  if (!columnType.includes("'pending'")) {
    await pool.query(
      "ALTER TABLE Users MODIFY Role ENUM('pending','patient','therapist','admin') NOT NULL DEFAULT 'pending'",
    );
  }
}

export async function ensureReferralsConstraint(): Promise<void> {
  try {
    await pool.query('ALTER TABLE Referrals DROP CHECK chk_ref_one_source');
  } catch (error) {
    const mysqlError = error as { code?: string; errno?: number };
    if (
      mysqlError?.code === 'ER_BAD_CHECK_DROP_FIELD_ERROR' ||
      mysqlError?.code === 'ER_CHECK_CONSTRAINT_NOT_FOUND' ||
      mysqlError?.errno === 3940 ||
      mysqlError?.errno === 3821
    ) {
      // Constraint does not exist; nothing to do.
      return;
    }
    if (mysqlError?.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      return;
    }
    throw error;
  }
}

export async function ensureSessionsSchema(): Promise<void> {
  const [sessionTimeColumn] = await pool.query<ColumnExistsRow[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Sessions'
       AND COLUMN_NAME = 'SessionTime'
     LIMIT 1`,
  );

  if (sessionTimeColumn.length === 0) {
    await pool.query("ALTER TABLE Sessions ADD COLUMN SessionTime TIME NULL AFTER SessionDate");
    await pool.query("UPDATE Sessions SET SessionTime = '08:00:00' WHERE SessionTime IS NULL");
    await pool.query("ALTER TABLE Sessions MODIFY SessionTime TIME NOT NULL");
  }

  const [therapistSlotConstraint] = await pool.query<ConstraintRow[]>(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Sessions'
       AND CONSTRAINT_NAME = 'uq_therapist_slot'
     LIMIT 1`,
  );

  if (therapistSlotConstraint.length === 0) {
    await pool.query(
      'ALTER TABLE Sessions ADD CONSTRAINT uq_therapist_slot UNIQUE (TherapistID, SessionDate, SessionTime)',
    );
  }

  try {
    await pool.query(
      "ALTER TABLE Sessions ADD CONSTRAINT chk_session_time CHECK (SessionTime BETWEEN '08:00:00' AND '16:00:00')",
    );
  } catch (error) {
    const mysqlError = error as { code?: string; errno?: number };
    if (
      mysqlError?.code !== 'ER_DUP_KEYNAME' &&
      mysqlError?.code !== 'ER_CANT_CREATE_MORE_THAN_ONE_TRG' &&
      mysqlError?.code !== 'ER_CHECK_CONSTRAINT_DUP_NAME' &&
      mysqlError?.errno !== 3822
    ) {
      // MySQL uses ER_DUP_KEYNAME for duplicate constraint names.
      throw error;
    }
  }
}

export default pool;
