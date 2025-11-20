-- All SQL statements used across the PT Clinic application.

-- Boot-time database checks
SELECT DATABASE() AS db;

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

SELECT COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Users'
  AND COLUMN_NAME = 'Role'
LIMIT 1;

ALTER TABLE Users MODIFY Role ENUM('pending','patient','therapist','admin') NOT NULL DEFAULT 'pending';

SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Users'
  AND COLUMN_NAME = 'NeedsPasswordReset'
LIMIT 1;

ALTER TABLE Users ADD COLUMN NeedsPasswordReset TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE Referrals DROP CHECK chk_ref_one_source;

SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Sessions'
  AND COLUMN_NAME = 'SessionTime'
LIMIT 1;

ALTER TABLE Sessions ADD COLUMN SessionTime TIME NULL AFTER SessionDate;

UPDATE Sessions
SET SessionTime = '08:00:00'
WHERE SessionTime IS NULL;

ALTER TABLE Sessions MODIFY SessionTime TIME NOT NULL;

SELECT CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Sessions'
  AND CONSTRAINT_NAME = 'uq_therapist_slot'
LIMIT 1;

ALTER TABLE Sessions ADD CONSTRAINT uq_therapist_slot UNIQUE (TherapistID, SessionDate, SessionTime);

ALTER TABLE Sessions ADD CONSTRAINT chk_session_time CHECK (SessionTime BETWEEN '08:00:00' AND '16:00:00');

SELECT 1;

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

-- Authentication and user management
SELECT Users.UserID,
       Users.Username,
       Users.PasswordHash,
       Users.PasswordSalt,
       Users.Role,
       Users.PatientID,
       Patients.Name AS PatientName,
       Users.StaffID,
       Staff.StaffName AS TherapistName,
       Users.NeedsPasswordReset
FROM Users
LEFT JOIN Patients ON Patients.PatientID = Users.PatientID
LEFT JOIN Staff ON Staff.StaffID = Users.StaffID
WHERE Users.Username = :username
LIMIT 1;

SELECT UserID, PasswordHash, PasswordSalt
FROM Users
WHERE UserID = :userId
LIMIT 1;

UPDATE Users
SET PasswordHash = :hash,
    PasswordSalt = :salt,
    NeedsPasswordReset = 0
WHERE UserID = :userId;

INSERT INTO Staff (StaffName, Position, Phone, DOB)
VALUES (:name, 'Therapist', :phone, :dob);

INSERT INTO Therapist (StaffID, Specialty)
VALUES (:staffId, :specialty);

INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, StaffID, NeedsPasswordReset)
VALUES (:username, :hash, :salt, 'therapist', :staffId, 1);

SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       Therapist.Specialty
FROM Therapist
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
ORDER BY Staff.StaffName;

SELECT ExerciseID, Name, BodyRegion, Difficulty
FROM Exercises
ORDER BY Name ASC;

SELECT StaffID
FROM Therapist
WHERE StaffID = :therapistId
LIMIT 1;

SELECT SessionTime
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled';

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

SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       TherapistID,
       TherapistName,
       Specialty
FROM vw_patient_upcoming_sessions
WHERE PatientID = :patientId
ORDER BY SessionDate ASC, SessionTime ASC;

DROP TRIGGER IF EXISTS trg_sessionexercise_default_resistance;
CREATE TRIGGER trg_sessionexercise_default_resistance
BEFORE INSERT ON SessionExercises
FOR EACH ROW
BEGIN
  IF NEW.Resistance IS NULL OR NEW.Resistance = '' THEN
    SET NEW.Resistance = 'Bodyweight';
  END IF;
END;

DROP TRIGGER IF EXISTS trg_outcome_score_insert_check;
CREATE TRIGGER trg_outcome_score_insert_check
BEFORE INSERT ON OutcomeMeasures
FOR EACH ROW
BEGIN
  IF NEW.Score < 0 OR NEW.Score > 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Outcome score must be between 0 and 100';
  END IF;
END;

DROP TRIGGER IF EXISTS trg_session_status_audit;
CREATE TRIGGER trg_session_status_audit
AFTER UPDATE ON Sessions
FOR EACH ROW
BEGIN
  IF NEW.Status <> OLD.Status THEN
    INSERT INTO SessionAudit (SessionID, OldStatus, NewStatus)
    VALUES (NEW.SessionID, OLD.Status, NEW.Status);
  END IF;
END;

SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       TherapistID,
       TherapistName,
       Specialty
FROM vw_patient_past_sessions
WHERE PatientID = :patientId
ORDER BY SessionDate DESC, SessionTime DESC
LIMIT 10;

SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       PatientID,
       PatientName
FROM vw_therapist_schedule
WHERE TherapistID = :therapistId
  AND SessionDate >= :today
ORDER BY SessionDate ASC, SessionTime ASC;

WITH ranked AS (
  SELECT Sessions.SessionID,
         Sessions.PatientID,
         Sessions.SessionDate,
         Sessions.SessionTime,
         Sessions.Status,
         Sessions.PainPre,
         Sessions.Notes,
         ROW_NUMBER() OVER (PARTITION BY Sessions.PatientID ORDER BY Sessions.SessionDate DESC, Sessions.SessionTime DESC) AS rn
  FROM Sessions
  WHERE Sessions.PatientID IN (:patientIds)
    AND Sessions.TherapistID = :therapistId
    AND Sessions.SessionDate < :today
)
SELECT SessionID,
       PatientID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes
FROM ranked
WHERE rn <= 3
ORDER BY PatientID, SessionDate DESC, SessionTime DESC;

WITH ranked AS (
  SELECT OutcomeMeasures.PatientID,
         OutcomeMeasures.MeasureName,
         OutcomeMeasures.Score,
         OutcomeMeasures.TakenOn,
         ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn ASC) AS rn_asc,
         ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn DESC) AS rn_desc
  FROM OutcomeMeasures
  WHERE OutcomeMeasures.PatientID IN (:patientIds)
)
SELECT PatientID,
       MeasureName,
       MAX(CASE WHEN rn_asc = 1 THEN Score END) AS BaselineScore,
       MAX(CASE WHEN rn_asc = 1 THEN TakenOn END) AS BaselineTakenOn,
       MAX(CASE WHEN rn_desc = 1 THEN Score END) AS LatestScore,
       MAX(CASE WHEN rn_desc = 1 THEN TakenOn END) AS LatestTakenOn
FROM ranked
GROUP BY PatientID, MeasureName;

SELECT SessionID,
       SessionDate,
       SessionTime
FROM Sessions
WHERE PatientID = :patientId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled'
LIMIT 1;

SELECT SessionID,
       SessionDate,
       SessionTime
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND SessionTime = :sessionTime
  AND Status <> 'Canceled'
LIMIT 1;

INSERT INTO Sessions (PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes)
VALUES (:patientId, :therapistId, :sessionDate, :sessionTime, 'Scheduled', :painPre, NULL, :notes);

SELECT Sessions.SessionID,
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
WHERE Sessions.SessionID = :sessionId
  AND Sessions.PatientID = :patientId
LIMIT 1;

SELECT StaffID
FROM Therapist
WHERE StaffID = :therapistId
LIMIT 1;

UPDATE Sessions
SET TherapistID = :therapistId,
    SessionDate = :sessionDate,
    SessionTime = :sessionTime,
    Status = :status,
    PainPre = :painPre,
    Notes = :notes
WHERE SessionID = :sessionId;

SELECT Sessions.SessionID,
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
WHERE Sessions.SessionID = :sessionId
  AND Sessions.PatientID = :patientId
LIMIT 1;

SELECT Sessions.SessionID,
       Sessions.SessionDate,
       Sessions.SessionTime,
       Sessions.Status,
       Sessions.PainPre,
       Sessions.Notes,
       Therapist.StaffID AS TherapistID,
       Staff.StaffName AS TherapistName,
       Therapist.Specialty
FROM Sessions
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
WHERE Sessions.PatientID = :patientId
  AND Sessions.SessionDate >= :today
ORDER BY Sessions.SessionDate ASC, Sessions.SessionTime ASC;
