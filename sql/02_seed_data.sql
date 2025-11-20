USE PT_Clinic;

SELECT COUNT(*) INTO @chk_ref_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Referrals'
  AND CONSTRAINT_TYPE = 'CHECK'
  AND CONSTRAINT_NAME = 'chk_ref_one_source';

SET @drop_chk_sql = IF(
    @chk_ref_exists > 0,
    'ALTER TABLE Referrals DROP CHECK `chk_ref_one_source`',
    'SELECT 1'
);
PREPARE drop_chk_stmt FROM @drop_chk_sql;
EXECUTE drop_chk_stmt;
DEALLOCATE PREPARE drop_chk_stmt;

-- Ensure the demo admin account always exists with this manually generated hash and salt. I hate myself.
INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role)
VALUES (
    'admin',
    0x7e9c9320dfd08f60cac99f3ddc0a05ec84bf8edd977dffd41c968a00425c7ce778286aab68c030144feabd93f51531b4a3e10b6c7f6fad9c6ae985ff7b439ca8,
    0x551a426cb12a289b6bd2382a786795f2,
    'admin'
)
ON DUPLICATE KEY UPDATE
    PasswordHash = VALUES(PasswordHash),
    PasswordSalt = VALUES(PasswordSalt),
    Role = 'admin',
    PatientID = NULL,
    StaffID = NULL;

-- Shoulder-focused exercises used for admin analytics
INSERT INTO Exercises (ExerciseID, Name, BodyRegion, Difficulty)
VALUES
    (6, 'Sleeper Stretch', 'Shoulder', 2),
    (7, 'Pendulum Circles', 'Shoulder', 1),
    (8, 'External Rotation Band', 'Shoulder', 3),
    (9, 'Scaption Raise', 'Shoulder', 3),
    (10, 'Prone Y Raise', 'Shoulder', 4)
ON DUPLICATE KEY UPDATE
    BodyRegion = VALUES(BodyRegion),
    Difficulty = VALUES(Difficulty);

-- Additional sessions spanning multiple months and statuses
INSERT INTO Sessions (SessionID, PatientID, TherapistID, SessionDate, Status, PainPre, PainPost, Notes)
VALUES
    (100, 1, 1, '2025-11-05', 'Completed', 6, 3, 'seed-admin 09:00'),
    (101, 2, 1, '2025-11-12', 'No-Show', 0, NULL, 'seed-admin 10:00'),
    (102, 3, 1, '2025-12-02', 'Completed', 4, 2, 'seed-admin 09:00'),
    (103, 4, 1, '2025-12-09', 'No-Show', 0, NULL, 'seed-admin 11:00'),
    (104, 1, 3, '2025-11-07', 'Completed', 5, 3, 'seed-admin 09:00'),
    (105, 5, 3, '2025-11-21', 'No-Show', 0, NULL, 'seed-admin 10:00'),
    (106, 2, 3, '2025-12-06', 'Completed', 3, 2, 'seed-admin 10:00'),
    (107, 3, 3, '2025-12-20', 'No-Show', 0, NULL, 'seed-admin 11:00'),
    (108, 4, 5, '2025-11-08', 'Completed', 7, 4, 'seed-admin 09:00'),
    (109, 5, 5, '2025-11-15', 'Completed', 6, 3, 'seed-admin 09:00'),
    (110, 1, 5, '2025-12-05', 'No-Show', 0, NULL, 'seed-admin 10:00'),
    (111, 3, 5, '2025-12-12', 'Completed', 4, 2, 'seed-admin 11:00'),
    (112, 2, 5, '2025-12-19', 'Completed', 5, 3, 'seed-admin 09:00'),
    (113, 4, 5, '2025-12-26', 'No-Show', 0, NULL, 'seed-admin 09:00')
ON DUPLICATE KEY UPDATE
    Status = VALUES(Status),
    PainPre = VALUES(PainPre),
    PainPost = VALUES(PainPost),
    Notes = VALUES(Notes);

-- Shoulder prescription volume linked to the new sessions
INSERT INTO SessionExercises (SessionExerciseID, SessionID, ExerciseID, Sets, Reps, Resistance)
VALUES
    (1000, 100, 3, 3, 10, 'Bodyweight'),
    (1001, 100, 6, 2, 12, 'Light band'),
    (1002, 101, 8, 3, 15, 'Green band'),
    (1003, 101, 9, 3, 10, '5 lb'),
    (1004, 102, 6, 3, 12, 'Light band'),
    (1005, 102, 10, 2, 8, 'Bodyweight'),
    (1006, 103, 7, 2, 15, 'None'),
    (1007, 103, 8, 3, 12, 'Green band'),
    (1008, 104, 3, 3, 12, 'Bodyweight'),
    (1009, 104, 9, 3, 10, '5 lb'),
    (1010, 105, 6, 2, 15, 'Light band'),
    (1011, 105, 7, 2, 20, 'None'),
    (1012, 106, 8, 3, 12, 'Blue band'),
    (1013, 106, 9, 3, 12, '8 lb'),
    (1014, 107, 10, 2, 8, 'Bodyweight'),
    (1015, 107, 3, 3, 10, 'Bodyweight'),
    (1016, 108, 6, 3, 12, 'Light band'),
    (1017, 108, 8, 3, 15, 'Green band'),
    (1018, 109, 9, 3, 10, '5 lb'),
    (1019, 109, 10, 2, 8, 'Bodyweight'),
    (1020, 110, 7, 2, 15, 'None'),
    (1021, 110, 6, 2, 12, 'Light band'),
    (1022, 111, 8, 3, 12, 'Blue band'),
    (1023, 111, 3, 3, 12, 'Bodyweight'),
    (1024, 112, 9, 3, 12, '8 lb'),
    (1025, 112, 10, 2, 10, 'Bodyweight'),
    (1026, 113, 6, 3, 12, 'Light band'),
    (1027, 113, 7, 2, 20, 'None')
ON DUPLICATE KEY UPDATE
    Sets = VALUES(Sets),
    Reps = VALUES(Reps),
    Resistance = VALUES(Resistance);

-- Baseline vs follow-up outcome measures for change tracking
INSERT INTO OutcomeMeasures (OutcomeID, PatientID, MeasureName, Score, TakenOn, Notes)
VALUES
    (100, 1, 'SPADI', 68.0, '2025-08-30', 'Baseline shoulder pain'),
    (101, 1, 'SPADI', 32.0, '2025-11-20', 'Post-plan progress'),
    (102, 2, 'LEFS', 42.0, '2025-08-25', 'Initial assessment'),
    (103, 2, 'LEFS', 64.0, '2025-12-05', 'Improved lower-extremity function'),
    (104, 3, 'DASH', 70.0, '2025-08-18', 'Baseline upper limb disability'),
    (105, 3, 'DASH', 40.0, '2025-12-10', 'Follow-up improvement'),
    (106, 4, 'SPADI', 75.0, '2025-09-02', 'Initial report'),
    (107, 4, 'SPADI', 50.0, '2025-12-18', 'Improved mobility'),
    (108, 5, 'LEFS', 55.0, '2025-08-22', 'Baseline function'),
    (109, 5, 'LEFS', 70.0, '2025-11-30', 'Significant improvement')
ON DUPLICATE KEY UPDATE
    Score = VALUES(Score),
    Notes = VALUES(Notes);
