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
  StaffID INT NULL UNIQUE,
  NeedsPasswordReset TINYINT(1) NOT NULL DEFAULT 0,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_patient
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_users_staff
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;
`;

const CREATE_SESSION_AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS SessionAudit (
  AuditID INT PRIMARY KEY AUTO_INCREMENT,
  SessionID INT NOT NULL,
  OldStatus ENUM('Scheduled','Completed','Canceled','No-Show') NOT NULL,
  NewStatus ENUM('Scheduled','Completed','Canceled','No-Show') NOT NULL,
  ChangedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_session
    FOREIGN KEY (SessionID) REFERENCES Sessions(SessionID)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;
`;

const VIEW_PATIENT_UPCOMING_SQL = `
CREATE OR REPLACE VIEW vw_patient_upcoming_sessions AS
SELECT Sessions.SessionID,
       Sessions.PatientID,
       Sessions.SessionDate,
       Sessions.SessionTime,
       Sessions.Status,
       Sessions.PainPre,
       Sessions.Notes,
       Sessions.TherapistID,
       Staff.StaffName AS TherapistName,
       Therapist.Specialty
FROM Sessions
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
WHERE Sessions.Status = 'Scheduled'
  AND Sessions.SessionDate >= CURDATE();
`;

const VIEW_PATIENT_PAST_SQL = `
CREATE OR REPLACE VIEW vw_patient_past_sessions AS
SELECT Sessions.SessionID,
       Sessions.PatientID,
       Sessions.SessionDate,
       Sessions.SessionTime,
       Sessions.Status,
       Sessions.PainPre,
       Sessions.Notes,
       Sessions.TherapistID,
       Staff.StaffName AS TherapistName,
       Therapist.Specialty
FROM Sessions
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
WHERE Sessions.SessionDate < CURDATE()
   OR Sessions.Status <> 'Scheduled';
`;

const VIEW_THERAPIST_SCHEDULE_SQL = `
CREATE OR REPLACE VIEW vw_therapist_schedule AS
SELECT Sessions.SessionID,
       Sessions.TherapistID,
       Sessions.PatientID,
       Patients.Name AS PatientName,
       Sessions.SessionDate,
       Sessions.SessionTime,
       Sessions.Status,
       Sessions.PainPre,
       Sessions.Notes
FROM Sessions
INNER JOIN Patients ON Patients.PatientID = Sessions.PatientID;
`;

const VIEW_OUTCOME_PROGRESS_SQL = `
CREATE OR REPLACE VIEW vw_outcome_progress AS
SELECT OutcomeMeasures.PatientID,
       Patients.Name AS PatientName,
       OutcomeMeasures.MeasureName,
       MIN(OutcomeMeasures.Score) AS MinScore,
       MAX(OutcomeMeasures.Score) AS MaxScore,
       COUNT(*) AS Measurements
FROM OutcomeMeasures
INNER JOIN Patients ON Patients.PatientID = OutcomeMeasures.PatientID
GROUP BY OutcomeMeasures.PatientID, Patients.Name, OutcomeMeasures.MeasureName;
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

  const [needsResetColumn] = await pool.query<ColumnExistsRow[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'Users'
       AND COLUMN_NAME = 'NeedsPasswordReset'
     LIMIT 1`,
  );

  if (needsResetColumn.length === 0) {
    await pool.query('ALTER TABLE Users ADD COLUMN NeedsPasswordReset TINYINT(1) NOT NULL DEFAULT 0');
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

export async function ensureDerivedStructures(): Promise<void> {
  await pool.query(CREATE_SESSION_AUDIT_TABLE_SQL);
  await pool.query(VIEW_PATIENT_UPCOMING_SQL);
  await pool.query(VIEW_PATIENT_PAST_SQL);
  await pool.query(VIEW_THERAPIST_SCHEDULE_SQL);
  await pool.query(VIEW_OUTCOME_PROGRESS_SQL);

  const runTriggerStatement = async (statement: string) => {
    try {
      await pool.query(statement);
    } catch (error) {
      const mysqlError = error as { code?: string };
      if (mysqlError?.code === 'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER') {
        console.warn('Skipping trigger creation due to insufficient privileges. Please set log_bin_trust_function_creators=1 if triggers are needed.');
        return;
      }
      throw error;
    }
  };

  await pool.query('DROP TRIGGER IF EXISTS trg_sessionexercise_default_resistance');
  await runTriggerStatement(`
    CREATE TRIGGER trg_sessionexercise_default_resistance
    BEFORE INSERT ON SessionExercises
    FOR EACH ROW
    BEGIN
      IF NEW.Resistance IS NULL OR NEW.Resistance = '' THEN
        SET NEW.Resistance = 'Bodyweight';
      END IF;
    END
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_outcome_score_insert_check');
  await runTriggerStatement(`
    CREATE TRIGGER trg_outcome_score_insert_check
    BEFORE INSERT ON OutcomeMeasures
    FOR EACH ROW
    BEGIN
      IF NEW.Score < 0 OR NEW.Score > 100 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Outcome score must be between 0 and 100';
      END IF;
    END
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_session_status_audit');
  await runTriggerStatement(`
    CREATE TRIGGER trg_session_status_audit
    AFTER UPDATE ON Sessions
    FOR EACH ROW
    BEGIN
      IF NEW.Status <> OLD.Status THEN
        INSERT INTO SessionAudit (SessionID, OldStatus, NewStatus)
        VALUES (NEW.SessionID, OLD.Status, NEW.Status);
      END IF;
    END
  `);
}

const DEFAULT_BOOT_RETRIES = Number(process.env.DB_BOOT_RETRIES ?? '20');
const DEFAULT_BOOT_DELAY_MS = Number(process.env.DB_BOOT_RETRY_DELAY_MS ?? '1500');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForDatabase(
  retries: number = DEFAULT_BOOT_RETRIES,
  delayMs: number = DEFAULT_BOOT_DELAY_MS,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      const delaySeconds = (delayMs / 1000).toFixed(1);
      console.warn(`Database not ready (attempt ${attempt}/${retries}). Retrying in ${delaySeconds}s...`);
      await sleep(delayMs);
    }
  }
}
