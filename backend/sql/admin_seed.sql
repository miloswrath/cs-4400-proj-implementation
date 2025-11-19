USE PT_Clinic;

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
INSERT INTO Sessions (SessionID, PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes)
VALUES
    (100, 1, 1, '2025-11-05', '09:00:00', 'Completed', 6, 3, 'seed-admin'),
    (101, 2, 1, '2025-11-12', '10:00:00', 'No-Show', 0, NULL, 'seed-admin'),
    (102, 3, 1, '2025-12-02', '09:00:00', 'Completed', 4, 2, 'seed-admin'),
    (103, 4, 1, '2025-12-09', '11:00:00', 'No-Show', 0, NULL, 'seed-admin'),
    (104, 1, 3, '2025-11-07', '09:00:00', 'Completed', 5, 3, 'seed-admin'),
    (105, 5, 3, '2025-11-21', '10:00:00', 'No-Show', 0, NULL, 'seed-admin'),
    (106, 2, 3, '2025-12-06', '10:00:00', 'Completed', 3, 2, 'seed-admin'),
    (107, 3, 3, '2025-12-20', '11:00:00', 'No-Show', 0, NULL, 'seed-admin'),
    (108, 4, 5, '2025-11-08', '09:00:00', 'Completed', 7, 4, 'seed-admin'),
    (109, 5, 5, '2025-11-15', '09:00:00', 'Completed', 6, 3, 'seed-admin'),
    (110, 1, 5, '2025-12-05', '10:00:00', 'No-Show', 0, NULL, 'seed-admin'),
    (111, 3, 5, '2025-12-12', '11:00:00', 'Completed', 4, 2, 'seed-admin'),
    (112, 2, 5, '2025-12-19', '09:00:00', 'Completed', 5, 3, 'seed-admin'),
    (113, 4, 5, '2025-12-26', '09:00:00', 'No-Show', 0, NULL, 'seed-admin')
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
