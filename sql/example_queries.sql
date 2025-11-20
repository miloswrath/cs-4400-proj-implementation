-- Example reference queries for PT Clinic application flows.
-- These statements are not executed automatically during startup.

-- ================================================================
-- Patient role: authentication & onboarding
-- ================================================================

-- Login: fetch user credentials and linked patient profile.
SELECT Users.UserID,
       Users.Username,
       Users.PasswordHash,
       Users.PasswordSalt,
       Users.Role,
       Users.PatientID,
       Patients.Name AS PatientName
FROM Users
LEFT JOIN Patients ON Patients.PatientID = Users.PatientID
WHERE Users.Username = :username
LIMIT 1;

-- Sign-up: ensure username uniqueness.
SELECT 1
FROM Users
WHERE Username = :username
LIMIT 1;

-- Sign-up: create patient record.
INSERT INTO Patients (Name, DOB, Phone)
VALUES (:name, :dob, :phone);

-- Sign-up: provision pending user account.
INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, PatientID)
VALUES (:username, :hash, :salt, 'pending', :patientId);

-- Therapist list shown on scheduling surfaces.
SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       Therapist.Specialty
FROM Therapist
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
ORDER BY Staff.StaffName;

-- Therapist availability: verify therapist existence.
SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       Therapist.Specialty
FROM Therapist
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
WHERE Therapist.StaffID = :therapistId
LIMIT 1;

-- Therapist availability: hours already booked for a date.
SELECT SessionTime
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled';

-- Upcoming patient sessions (scheduled + future).
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
  AND Sessions.Status = 'Scheduled'
  AND Sessions.SessionDate >= :today
ORDER BY Sessions.SessionDate ASC, Sessions.SessionTime ASC;

-- Recent/past patient sessions (completed, canceled, or in the past).
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
  AND (Sessions.SessionDate < :today OR Sessions.Status <> 'Scheduled')
ORDER BY Sessions.SessionDate DESC, Sessions.SessionTime DESC
LIMIT 10;

-- Patient onboarding: confirm patient exists.
SELECT Name
FROM Patients
WHERE PatientID = :patientId
LIMIT 1;

-- Patient onboarding: check for existing referral.
SELECT ReferralID
FROM Referrals
WHERE PatientID = :patientId
LIMIT 1;

-- Patient onboarding: update an existing referral.
UPDATE Referrals
SET DxCode = :dxCode,
    ReferralDate = :referralDate,
    ReferringProvider = :referringProvider
WHERE ReferralID = :referralId;

-- Patient onboarding: insert a referral when none exists.
INSERT INTO Referrals (PatientID, DxCode, ReferralDate, ReferringProvider)
VALUES (:patientId, :dxCode, :referralDate, :referringProvider);

-- Patient onboarding: promote account out of pending status.
UPDATE Users
SET Role = 'patient'
WHERE PatientID = :patientId;

-- Session booking: ensure patient exists.
SELECT PatientID
FROM Patients
WHERE PatientID = :patientId
LIMIT 1;

-- Session booking: ensure therapist exists.
SELECT StaffID
FROM Therapist
WHERE StaffID = :therapistId
LIMIT 1;

-- Session booking: guard against duplicate patient sessions per day.
SELECT SessionID
FROM Sessions
WHERE PatientID = :patientId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled'
LIMIT 1;

-- Session booking: prevent therapist double-booking same slot.
SELECT SessionID
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND SessionTime = :sessionTime
  AND Status <> 'Canceled'
LIMIT 1;

-- Session booking: create the appointment.
INSERT INTO Sessions (PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes)
VALUES (:patientId, :therapistId, :sessionDate, :sessionTime, 'Scheduled', :painPre, NULL, :notes);

-- Session edit: load the current session details for validation.
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

-- Session edit: verify therapist if changed.
SELECT StaffID
FROM Therapist
WHERE StaffID = :therapistId
LIMIT 1;

-- Session edit: enforce one session per patient per day (excluding this one).
SELECT SessionID
FROM Sessions
WHERE PatientID = :patientId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled'
  AND SessionID <> :sessionId
LIMIT 1;

-- Session edit: ensure therapist still has the requested slot open.
SELECT SessionID
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND SessionTime = :sessionTime
  AND Status <> 'Canceled'
  AND SessionID <> :sessionId
LIMIT 1;

-- Session edit: persist the updated appointment details.
UPDATE Sessions
SET TherapistID = :therapistId,
    SessionDate = :sessionDate,
    SessionTime = :sessionTime,
    Status = :status,
    PainPre = :painPre,
    Notes = :notes
WHERE SessionID = :sessionId;

-- ================================================================
-- Admin role: analytics & monitoring
-- ================================================================

-- Monthly no-show metrics per therapist.
SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       DATE_FORMAT(Sessions.SessionDate, '%Y-%m') AS MonthLabel,
       SUM(CASE WHEN Sessions.Status = 'No-Show' THEN 1 ELSE 0 END) AS NoShows,
       COUNT(*) AS TotalSessions
FROM Sessions
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
GROUP BY Therapist.StaffID, Staff.StaffName, MonthLabel
ORDER BY MonthLabel ASC, Staff.StaffName ASC;

-- Outcome change per patient and measurement instrument.
WITH ranked AS (
  SELECT
    OutcomeMeasures.PatientID,
    OutcomeMeasures.MeasureName,
    OutcomeMeasures.Score,
    OutcomeMeasures.TakenOn,
    ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn ASC) AS rn_asc,
    ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn DESC) AS rn_desc
  FROM OutcomeMeasures
)
SELECT
  ranked.PatientID,
  Patients.Name AS PatientName,
  ranked.MeasureName,
  MAX(CASE WHEN ranked.rn_asc = 1 THEN ranked.Score END) AS BaselineScore,
  MAX(CASE WHEN ranked.rn_desc = 1 THEN ranked.Score END) AS LatestScore,
  MAX(CASE WHEN ranked.rn_desc = 1 THEN ranked.Score END) - MAX(CASE WHEN ranked.rn_asc = 1 THEN ranked.Score END) AS Delta
FROM ranked
INNER JOIN Patients ON Patients.PatientID = ranked.PatientID
GROUP BY ranked.PatientID, Patients.Name, ranked.MeasureName
HAVING BaselineScore IS NOT NULL AND LatestScore IS NOT NULL
ORDER BY Patients.Name ASC, ranked.MeasureName ASC;

-- Top shoulder exercises by prescription volume.
SELECT Exercises.Name AS ExerciseName,
       COUNT(*) AS Prescriptions
FROM SessionExercises
INNER JOIN Exercises ON Exercises.ExerciseID = SessionExercises.ExerciseID
WHERE Exercises.BodyRegion = 'Shoulder'
GROUP BY Exercises.ExerciseID, Exercises.Name
ORDER BY Prescriptions DESC, Exercises.Name ASC
LIMIT 5;

-- Detailed outcome history for table views.
SELECT OutcomeMeasures.OutcomeID,
       OutcomeMeasures.PatientID,
       Patients.Name AS PatientName,
       OutcomeMeasures.MeasureName,
       OutcomeMeasures.Score,
       OutcomeMeasures.TakenOn,
       OutcomeMeasures.Notes
FROM OutcomeMeasures
INNER JOIN Patients ON Patients.PatientID = OutcomeMeasures.PatientID
ORDER BY Patients.Name ASC, OutcomeMeasures.MeasureName ASC, OutcomeMeasures.TakenOn ASC;

-- Shoulder exercise session drill-down.
SELECT Exercises.Name AS ExerciseName,
       SessionExercises.SessionID,
       Sessions.SessionDate,
       Patients.Name AS PatientName,
       Staff.StaffName AS TherapistName
FROM SessionExercises
INNER JOIN Exercises ON Exercises.ExerciseID = SessionExercises.ExerciseID
INNER JOIN Sessions ON Sessions.SessionID = SessionExercises.SessionID
INNER JOIN Patients ON Patients.PatientID = Sessions.PatientID
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
WHERE Exercises.BodyRegion = 'Shoulder'
ORDER BY Exercises.Name ASC, Sessions.SessionDate DESC;

-- Admin: onboarding a new therapist (Staff + Therapist + User rows).
INSERT INTO Staff (StaffName, Position, Phone, DOB)
VALUES (:name, 'Therapist', :phone, :dob);

INSERT INTO Therapist (StaffID, Specialty)
VALUES (:staffId, :specialty);

INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, StaffID, NeedsPasswordReset)
VALUES (:username, :hash, :salt, 'therapist', :staffId, 1);

-- Auth: clearing the reset flag once a therapist creates a permanent password.
UPDATE Users
SET PasswordHash = :hash,
    PasswordSalt = :salt,
    NeedsPasswordReset = 0
WHERE UserID = :userId;

-- Therapist dashboard: personal upcoming schedule.
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

-- Therapist dashboard: last three sessions per patient with this therapist.
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

-- Therapist dashboard: baseline vs latest outcome scores per patient.
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

-- Therapist session workflow: verify ownership and update session data.
SELECT SessionID, PatientID
FROM Sessions
WHERE SessionID = :sessionId
  AND TherapistID = :therapistId
LIMIT 1;

UPDATE Sessions
SET Status = :status,
    Notes = :notes,
    PainPre = :painPre,
    PainPost = :painPost
WHERE SessionID = :sessionId;

DELETE FROM SessionExercises
WHERE SessionID = :sessionId;

INSERT INTO SessionExercises (SessionID, ExerciseID, Sets, Reps, Resistance)
VALUES (:sessionId, :exerciseId, :sets, :reps, :resistance);

INSERT INTO OutcomeMeasures (PatientID, MeasureName, Score, TakenOn, Notes)
VALUES (:patientId, :measureName, :score, :takenOn, :notes)
ON DUPLICATE KEY UPDATE
  Score = VALUES(Score),
  Notes = VALUES(Notes);

-- ================================================================
-- Project requirement showcase queries
-- ================================================================

-- View-based upcoming sessions (join + filter).
SELECT SessionID,
       SessionDate,
       SessionTime,
       TherapistName
FROM vw_patient_upcoming_sessions
WHERE PatientID = :patientId;

-- Aggregated therapist workload using the schedule view.
SELECT TherapistID,
       DATE_FORMAT(SessionDate, '%Y-%m') AS MonthLabel,
       COUNT(*) AS TotalVisits,
       SUM(CASE WHEN Status = 'No-Show' THEN 1 ELSE 0 END) AS MissedVisits
FROM vw_therapist_schedule
GROUP BY TherapistID, MonthLabel;

-- Outcome progress overview by view.
SELECT PatientID,
       PatientName,
       MeasureName,
       MinScore,
       MaxScore,
       Measurements
FROM vw_outcome_progress
WHERE Measurements >= 1;

-- Subquery: patients with no recorded past sessions yet.
SELECT Patients.PatientID,
       Patients.Name
FROM Patients
WHERE Patients.PatientID NOT IN (
    SELECT DISTINCT PatientID FROM vw_patient_past_sessions
);

-- Trigger-driven audit log join.
SELECT SessionAudit.SessionID,
       Sessions.PatientID,
       SessionAudit.OldStatus,
       SessionAudit.NewStatus,
       SessionAudit.ChangedAt
FROM SessionAudit
INNER JOIN Sessions ON Sessions.SessionID = SessionAudit.SessionID
ORDER BY SessionAudit.ChangedAt DESC;
