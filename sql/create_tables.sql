CREATE DATABASE IF NOT EXISTS PT_Clinic;
USE PT_Clinic;

-- (Re)create in dependency-safe order
DROP TABLE IF EXISTS SessionExercises;
DROP TABLE IF EXISTS OutcomeMeasures;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Referrals;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Therapist;
DROP TABLE IF EXISTS Exercises;
DROP TABLE IF EXISTS Staff;
DROP TABLE IF EXISTS Patients;


-- =========================
-- Core entities
-- =========================
CREATE TABLE Patients (
    PatientID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    DOB DATE,
    Phone VARCHAR(20)
);

CREATE TABLE Staff (
    StaffID INT PRIMARY KEY AUTO_INCREMENT,
    StaffName VARCHAR(100) NOT NULL,
    Position VARCHAR(50) NOT NULL, -- e.g., Therapist, PTA, Admin
    Phone VARCHAR(20),
    DOB DATE
);

-- Therapist is a strict subtype of Staff; only Specialty lives here.
CREATE TABLE Therapist (
    StaffID INT PRIMARY KEY,
    Specialty VARCHAR(50) NOT NULL,
    CONSTRAINT fk_therapist_staff
        FOREIGN KEY (StaffID) REFERENCES Staff(StaffID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE Exercises (
    ExerciseID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    BodyRegion VARCHAR(30) NOT NULL,
    Difficulty TINYINT NOT NULL,
    CONSTRAINT chk_ex_difficulty CHECK (Difficulty BETWEEN 1 AND 5)
);

-- =========================
-- Clinical events / records
-- =========================
CREATE TABLE Sessions (
    SessionID INT PRIMARY KEY AUTO_INCREMENT,
    PatientID INT NOT NULL,
    TherapistID INT NOT NULL,               -- FK to Therapist (StaffID)
    SessionDate DATE NOT NULL,
    SessionTime TIME NOT NULL DEFAULT '08:00:00',
    Status ENUM('Scheduled','Completed','Canceled','No-Show') NOT NULL DEFAULT 'Scheduled',
    PainPre TINYINT NULL,
    PainPost TINYINT NULL,
    Notes TEXT,
    CONSTRAINT chk_session_time CHECK (SessionTime BETWEEN '08:00:00' AND '16:00:00'),
    CONSTRAINT chk_painpre  CHECK (PainPre  BETWEEN 0 AND 10 OR PainPre  IS NULL),
    CONSTRAINT chk_painpost CHECK (PainPost BETWEEN 0 AND 10 OR PainPost IS NULL),
    CONSTRAINT fk_session_patient
        FOREIGN KEY (PatientID) REFERENCES Patients(PatientID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_therapist
        FOREIGN KEY (TherapistID) REFERENCES Therapist(StaffID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    -- Optional business rule: at most one session per patient per date
    CONSTRAINT uq_patient_sessiondate UNIQUE (PatientID, SessionDate),
    CONSTRAINT uq_therapist_slot UNIQUE (TherapistID, SessionDate, SessionTime)
);

CREATE TABLE SessionAudit (
    AuditID INT PRIMARY KEY AUTO_INCREMENT,
    SessionID INT NOT NULL,
    OldStatus ENUM('Scheduled','Completed','Canceled','No-Show') NOT NULL,
    NewStatus ENUM('Scheduled','Completed','Canceled','No-Show') NOT NULL,
    ChangedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_session
        FOREIGN KEY (SessionID) REFERENCES Sessions(SessionID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE Referrals (
    ReferralID INT PRIMARY KEY AUTO_INCREMENT,
    PatientID INT NOT NULL,
    DxCode VARCHAR(20) NOT NULL,
    ReferralDate DATE NOT NULL,
    ReferringProvider VARCHAR(100) NULL, -- external name/NPI optional
    CONSTRAINT fk_ref_patient
        FOREIGN KEY (PatientID) REFERENCES Patients(PatientID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    -- Optional de-dup rule
    INDEX idx_ref_patient_date_dx (PatientID, ReferralDate, DxCode)
);

CREATE TABLE SessionExercises (
    SessionExerciseID INT PRIMARY KEY AUTO_INCREMENT,
    SessionID INT NOT NULL,
    ExerciseID INT NOT NULL,
    Sets TINYINT NOT NULL,
    Reps TINYINT NOT NULL,
    Resistance VARCHAR(20),
    CONSTRAINT chk_sets CHECK (Sets > 0),
    CONSTRAINT chk_reps CHECK (Reps > 0),
    CONSTRAINT fk_se_session
        FOREIGN KEY (SessionID) REFERENCES Sessions(SessionID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_se_exercise
        FOREIGN KEY (ExerciseID) REFERENCES Exercises(ExerciseID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    -- Avoid duplicate identical prescriptions within a session
    CONSTRAINT uq_se_nodup UNIQUE (SessionID, ExerciseID, Sets, Reps, Resistance)
);

CREATE TABLE OutcomeMeasures (
    OutcomeID INT PRIMARY KEY AUTO_INCREMENT,
    PatientID INT NOT NULL,
    MeasureName VARCHAR(50) NOT NULL,
    Score DECIMAL(5,2) NOT NULL,
    TakenOn DATE NOT NULL,
    Notes TEXT,
    CONSTRAINT fk_om_patient
        FOREIGN KEY (PatientID) REFERENCES Patients(PatientID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    -- Prevent duplicate scoring of same instrument on same day
    CONSTRAINT uq_om_unique UNIQUE (PatientID, MeasureName, TakenOn),
    INDEX idx_patient_measure (PatientID, MeasureName)
);

-- =========================
-- Authentication
-- =========================
CREATE TABLE Users (
    UserID INT PRIMARY KEY AUTO_INCREMENT,
    Username VARCHAR(60) NOT NULL UNIQUE,
    PasswordHash VARBINARY(255) NOT NULL,
    PasswordSalt VARBINARY(255) NOT NULL,
    Role ENUM('patient','staff','therapist','admin') NOT NULL DEFAULT 'patient',
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
);

-- =========================
-- Seed data (consistent with constraints)
-- =========================

-- Patients
INSERT INTO Patients (Name, DOB, Phone) VALUES
('Alice Johnson', '1985-04-12', '555-1234'),
('Bob Smith',     '1990-07-22', '555-5678'),
('Carla Reyes',   '1978-11-03', '555-9012'),
('David Kim',     '2000-01-15', '555-3456'),
('Eva Martinez',  '1965-09-30', '555-7890');

-- Staff (include both therapists and non-therapists)
INSERT INTO Staff (StaffName, Position, Phone, DOB) VALUES
('Dr. Sarah Lee', 'Therapist', '555-1111', '1980-05-10'),
('Tom Nguyen',    'Admin',     '555-2222', '1988-08-08'),
('Rachel Green',  'Therapist', '555-3333', '1992-03-25'),
('Mike Brown',    'PTA',       '555-4444', '1975-12-01'),
('Linda Park',    'Therapist', '555-5555', '1983-06-17');

-- Therapist (only true therapists should appear here)
INSERT INTO Therapist (StaffID, Specialty) VALUES
(1, 'Wrist Rehab'),
(3, 'Hip Rehab'),
(5, 'Knee Rehab');
-- Note: PTA (4) and Admin (2) are NOT inserted into Therapist.

-- Exercises
INSERT INTO Exercises (Name, BodyRegion, Difficulty) VALUES
('SLR',          'Knee',    2),
('Bridges',      'Lumbar',  3),
('Wall Angels',  'Shoulder',4),
('Heel Slides',  'Hip',     1),
('Plank',        'Core',    5);

-- Sessions (TherapistID must reference Therapist.StaffID: 1,3,5)
INSERT INTO Sessions (PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes) VALUES
(1, 1, '2025-10-10', '09:00:00', 'Completed', 7, 4, 'Initial evaluation and assessment'),
(2, 3, '2025-10-11', '10:00:00', 'Completed', 6, 3, 'Manual therapy and stretching'),
(3, 5, '2025-10-12', '13:30:00', 'Scheduled', 5, 5, 'Follow-up session planned'),
(4, 3, '2025-10-13', '08:30:00', 'Canceled',  0, 0, 'Patient canceled due to illness'),
(5, 1, '2025-10-14', '11:00:00', 'Completed', 8, 5, 'Pain management and mobility work');

INSERT INTO SessionAudit (SessionID, OldStatus, NewStatus)
VALUES
(1, 'Scheduled', 'Completed'),
(2, 'Scheduled', 'Completed');

-- Referrals
-- Use internal referrer when it’s one of the therapists; otherwise use external name.
INSERT INTO Referrals (PatientID, DxCode, ReferralDate, ReferringProvider) VALUES
(1, 'M54.5', '2025-10-01', 'Dr. Kevin Lee'),                    
(2, 'G44.1', '2025-10-03', 'Dr. Rachel Brown'),    
(3, 'S83.2', '2025-10-05', 'Dr. Kevin Nguyen'),   
(4, 'M25.5', '2025-10-07', 'Dr. Lee Blue'),        
(5, 'R51',   '2025-10-09', 'Dr. Harry James');     

-- SessionExercises
INSERT INTO SessionExercises (SessionID, ExerciseID, Sets, Reps, Resistance) VALUES
(1, 1, 3, 10, '5 lb'),
(2, 2, 2, 15, 'Blue band'),
(2, 3, 3, 12, 'Bodyweight'),
(5, 4, 2, 20, 'None'),
(5, 5, 3, 10, 'Green band');

-- OutcomeMeasures
INSERT INTO OutcomeMeasures (PatientID, MeasureName, Score, TakenOn, Notes) VALUES
(1, 'ODI', 24.50, '2025-10-15', 'Moderate disability noted'),
(2, 'LEFS', 65.00, '2025-10-16', 'Improved mobility since last visit'),
(3, 'TUG', 12.30, '2025-10-17', 'Within normal range'),
(4, 'ODI', 30.00, '2025-10-18', 'Severe pain reported'),
(5, 'LEFS', 70.00, '2025-10-19', 'Good progress in strength and endurance');

-- =========================
-- Relational views for analytics and scheduling
-- =========================
DROP VIEW IF EXISTS vw_patient_upcoming_sessions;
CREATE VIEW vw_patient_upcoming_sessions AS
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

DROP VIEW IF EXISTS vw_patient_past_sessions;
CREATE VIEW vw_patient_past_sessions AS
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

DROP VIEW IF EXISTS vw_therapist_schedule;
CREATE VIEW vw_therapist_schedule AS
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

DROP VIEW IF EXISTS vw_outcome_progress;
CREATE VIEW vw_outcome_progress AS
SELECT OutcomeMeasures.PatientID,
       Patients.Name AS PatientName,
       OutcomeMeasures.MeasureName,
       MIN(OutcomeMeasures.Score) AS MinScore,
       MAX(OutcomeMeasures.Score) AS MaxScore,
       COUNT(*) AS Measurements
FROM OutcomeMeasures
INNER JOIN Patients ON Patients.PatientID = OutcomeMeasures.PatientID
GROUP BY OutcomeMeasures.PatientID, Patients.Name, OutcomeMeasures.MeasureName;

-- =========================
-- Triggers to enforce business rules
-- =========================
DROP TRIGGER IF EXISTS trg_sessionexercise_default_resistance;
DELIMITER $$
CREATE TRIGGER trg_sessionexercise_default_resistance
BEFORE INSERT ON SessionExercises
FOR EACH ROW
BEGIN
    IF NEW.Resistance IS NULL OR NEW.Resistance = '' THEN
        SET NEW.Resistance = 'Bodyweight';
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_outcome_score_insert_check;
DELIMITER $$
CREATE TRIGGER trg_outcome_score_insert_check
BEFORE INSERT ON OutcomeMeasures
FOR EACH ROW
BEGIN
    IF NEW.Score < 0 OR NEW.Score > 100 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Outcome score must be between 0 and 100';
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_session_status_audit;
DELIMITER $$
CREATE TRIGGER trg_session_status_audit
AFTER UPDATE ON Sessions
FOR EACH ROW
BEGIN
    IF NEW.Status <> OLD.Status THEN
        INSERT INTO SessionAudit (SessionID, OldStatus, NewStatus)
        VALUES (NEW.SessionID, OLD.Status, NEW.Status);
    END IF;
END$$
DELIMITER ;
