"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const db_1 = __importStar(require("./db"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
const corsOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : undefined,
    credentials: true,
}));
app.get('/health', async (_req, res) => {
    try {
        const [result] = await db_1.default.query('SELECT 1');
        const database = await (0, db_1.verifyDatabase)();
        res.json({ status: 'ok', database, ping: result });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ status: 'error', message });
    }
});
const SCHEDULING_START_HOUR = 8;
const SCHEDULING_END_HOUR = 16;
function allowedSlots() {
    const slots = [];
    for (let hour = SCHEDULING_START_HOUR; hour <= SCHEDULING_END_HOUR; hour += 1) {
        const hourString = hour.toString().padStart(2, '0');
        slots.push(`${hourString}:00:00`);
    }
    return slots;
}
const ALLOWED_SLOTS = allowedSlots();
function normalizeTimeInput(time) {
    if (typeof time !== 'string')
        return null;
    const trimmed = time.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
        return `${trimmed}:00`;
    }
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        return trimmed;
    }
    return null;
}
const SESSION_STATUSES = new Set(['Scheduled', 'Completed', 'Canceled', 'No-Show']);
function generateTempPassword(length = 12) {
    const raw = crypto_1.default.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    return raw.slice(0, length) || `PT${Date.now().toString(36)}`;
}
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ message: 'Username and password are required.' });
        return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    try {
        const [rows] = await db_1.default.query(`SELECT Users.UserID,
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
       LIMIT 1`, { username: normalizedUsername });
        if (rows.length === 0) {
            res.status(401).json({ message: 'Invalid username or password.' });
            return;
        }
        const user = rows[0];
        const isValid = await (0, auth_1.verifyPassword)(password, user.PasswordHash, user.PasswordSalt);
        if (!isValid) {
            res.status(401).json({ message: 'Invalid username or password.' });
            return;
        }
        res.json({
            userId: user.UserID,
            username: user.Username,
            role: user.Role,
            patientId: user.PatientID,
            patientName: user.PatientName,
            needsProfileCompletion: user.Role === 'pending',
            staffId: user.StaffID,
            therapistName: user.TherapistName,
            needsPasswordReset: Boolean(user.NeedsPasswordReset),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
});
app.post('/auth/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body ?? {};
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        res.status(400).json({ message: 'A valid user ID is required.' });
        return;
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        res.status(400).json({ message: 'Current and new passwords are required.' });
        return;
    }
    if (newPassword.length < 8) {
        res.status(400).json({ message: 'New password must be at least 8 characters long.' });
        return;
    }
    try {
        const [rows] = await db_1.default.query(`SELECT UserID, PasswordHash, PasswordSalt
       FROM Users
       WHERE UserID = :userId
       LIMIT 1`, { userId: numericUserId });
        if (rows.length === 0) {
            res.status(404).json({ message: 'User not found.' });
            return;
        }
        const record = rows[0];
        const isValid = await (0, auth_1.verifyPassword)(currentPassword, record.PasswordHash, record.PasswordSalt);
        if (!isValid) {
            res.status(401).json({ message: 'Current password is incorrect.' });
            return;
        }
        const { hash, salt } = await (0, auth_1.createPasswordRecord)(newPassword);
        await db_1.default.execute(`UPDATE Users
       SET PasswordHash = :hash,
           PasswordSalt = :salt,
           NeedsPasswordReset = 0
       WHERE UserID = :userId`, { hash, salt, userId: numericUserId });
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to change password right now.';
        res.status(500).json({ message });
    }
});
app.get('/therapists', async (_req, res) => {
    try {
        const [therapists] = await db_1.default.query(`SELECT Therapist.StaffID AS TherapistID,
              Staff.StaffName,
              Therapist.Specialty
       FROM Therapist
       INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
       ORDER BY Staff.StaffName`);
        res.json({ therapists });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
});
app.get('/exercises', async (_req, res) => {
    try {
        const [rows] = await db_1.default.query(`SELECT ExerciseID, Name, BodyRegion, Difficulty FROM Exercises ORDER BY Name ASC`);
        res.json({
            exercises: rows.map((row) => ({
                exerciseId: row.ExerciseID,
                name: row.Name,
                bodyRegion: row.BodyRegion,
                difficulty: row.Difficulty,
            })),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load exercises.';
        res.status(500).json({ message });
    }
});
app.post('/admin/therapists', async (req, res) => {
    const { name, phone, dob, specialty, username } = req.body ?? {};
    const errors = [];
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedSpecialty = typeof specialty === 'string' ? specialty.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const dobValue = typeof dob === 'string' ? dob : '';
    if (!trimmedName)
        errors.push('Therapist name is required.');
    if (!trimmedPhone)
        errors.push('Phone number is required.');
    if (!trimmedSpecialty)
        errors.push('Specialty is required.');
    if (!normalizedUsername)
        errors.push('Username is required.');
    if (!dobValue || Number.isNaN(Date.parse(dobValue)))
        errors.push('A valid date of birth is required.');
    if (errors.length > 0) {
        res.status(400).json({ message: errors.length === 1 ? errors[0] : errors.join(' ') });
        return;
    }
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [existingUser] = await connection.query('SELECT 1 FROM Users WHERE Username = :username LIMIT 1', { username: normalizedUsername });
        if (existingUser.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'Username already exists.' });
            return;
        }
        const [staffResult] = await connection.execute(`INSERT INTO Staff (StaffName, Position, Phone, DOB)
       VALUES (:name, 'Therapist', :phone, :dob)`, {
            name: trimmedName,
            phone: trimmedPhone,
            dob: dobValue,
        });
        const staffId = staffResult.insertId;
        await connection.execute(`INSERT INTO Therapist (StaffID, Specialty)
       VALUES (:staffId, :specialty)`, { staffId, specialty: trimmedSpecialty });
        const tempPassword = generateTempPassword();
        const { hash, salt } = await (0, auth_1.createPasswordRecord)(tempPassword);
        await connection.execute(`INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, StaffID, NeedsPasswordReset)
       VALUES (:username, :hash, :salt, 'therapist', :staffId, 1)`, {
            username: normalizedUsername,
            hash,
            salt,
            staffId,
        });
        await connection.commit();
        res.status(201).json({
            staffId,
            username: normalizedUsername,
            tempPassword,
        });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unable to create therapist.';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.get('/therapists/:therapistId/dashboard', async (req, res) => {
    const therapistId = Number(req.params.therapistId);
    if (!Number.isInteger(therapistId) || therapistId <= 0) {
        res.status(400).json({ message: 'A valid therapist ID is required.' });
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().slice(0, 10);
    try {
        const [therapistRows] = await db_1.default.query(`SELECT StaffID FROM Therapist WHERE StaffID = :therapistId LIMIT 1`, { therapistId });
        if (therapistRows.length === 0) {
            res.status(404).json({ message: 'Therapist not found.' });
            return;
        }
        const [upcomingRows] = await db_1.default.query(`SELECT SessionID,
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
       ORDER BY SessionDate ASC, SessionTime ASC`, { therapistId, today: todayString });
        if (upcomingRows.length === 0) {
            res.json({ upcomingSessions: [], patientSummaries: {} });
            return;
        }
        const patientIds = Array.from(new Set(upcomingRows.map((row) => row.PatientID)));
        const buildInClause = (values, prefix) => {
            const params = {};
            const tokens = values.map((value, index) => {
                const key = `${prefix}${index}`;
                params[key] = value;
                return `:${key}`;
            });
            return { clause: tokens.join(', '), params };
        };
        const patientSummaries = {};
        patientIds.forEach((id) => {
            patientSummaries[id] = { previousSessions: [], outcomeSummaries: [] };
        });
        const { clause: historyClause, params: historyParams } = buildInClause(patientIds, 'patientHist');
        const [historyRows] = await db_1.default.query(`WITH ranked AS (
         SELECT Sessions.SessionID,
                Sessions.PatientID,
                Sessions.SessionDate,
                Sessions.SessionTime,
                Sessions.Status,
                Sessions.PainPre,
                Sessions.Notes,
                ROW_NUMBER() OVER (PARTITION BY Sessions.PatientID ORDER BY Sessions.SessionDate DESC, Sessions.SessionTime DESC) AS rn
         FROM Sessions
         WHERE Sessions.PatientID IN (${historyClause})
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
       ORDER BY PatientID, SessionDate DESC, SessionTime DESC`, { therapistId, today: todayString, ...historyParams });
        historyRows.forEach((row) => {
            const summary = patientSummaries[row.PatientID] ?? {
                previousSessions: [],
                outcomeSummaries: [],
            };
            summary.previousSessions.push({
                sessionId: row.SessionID,
                sessionDate: row.SessionDate,
                sessionTime: row.SessionTime,
                status: row.Status,
                painPre: row.PainPre === null ? null : Number(row.PainPre),
                notes: row.Notes,
            });
            patientSummaries[row.PatientID] = summary;
        });
        const { clause: outcomeClause, params: outcomeParams } = buildInClause(patientIds, 'patientOutcome');
        const [outcomeRows] = await db_1.default.query(`WITH ranked AS (
         SELECT OutcomeMeasures.PatientID,
                OutcomeMeasures.MeasureName,
                OutcomeMeasures.Score,
                OutcomeMeasures.TakenOn,
                ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn ASC) AS rn_asc,
                ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn DESC) AS rn_desc
         FROM OutcomeMeasures
         WHERE OutcomeMeasures.PatientID IN (${outcomeClause})
       )
       SELECT PatientID,
              MeasureName,
              MAX(CASE WHEN rn_asc = 1 THEN Score END) AS BaselineScore,
              MAX(CASE WHEN rn_asc = 1 THEN TakenOn END) AS BaselineTakenOn,
              MAX(CASE WHEN rn_desc = 1 THEN Score END) AS LatestScore,
              MAX(CASE WHEN rn_desc = 1 THEN TakenOn END) AS LatestTakenOn
       FROM ranked
       GROUP BY PatientID, MeasureName`, outcomeParams);
        outcomeRows.forEach((row) => {
            const summary = patientSummaries[row.PatientID] ?? {
                previousSessions: [],
                outcomeSummaries: [],
            };
            summary.outcomeSummaries.push({
                measureName: row.MeasureName,
                baselineScore: row.BaselineScore === null ? null : Number(row.BaselineScore),
                baselineTakenOn: row.BaselineTakenOn,
                latestScore: row.LatestScore === null ? null : Number(row.LatestScore),
                latestTakenOn: row.LatestTakenOn,
            });
            patientSummaries[row.PatientID] = summary;
        });
        const upcomingSessions = upcomingRows.map((row) => ({
            sessionId: row.SessionID,
            sessionDate: row.SessionDate,
            sessionTime: row.SessionTime,
            status: row.Status,
            painPre: row.PainPre === null ? null : Number(row.PainPre),
            notes: row.Notes,
            patientId: row.PatientID,
            patientName: row.PatientName,
        }));
        res.json({ upcomingSessions, patientSummaries });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load therapist dashboard.';
        res.status(500).json({ message });
    }
});
app.post('/therapists/:therapistId/sessions/:sessionId/start', async (req, res) => {
    const therapistId = Number(req.params.therapistId);
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(therapistId) || therapistId <= 0 || !Number.isInteger(sessionId) || sessionId <= 0) {
        res.status(400).json({ message: 'Valid therapist and session IDs are required.' });
        return;
    }
    const body = (req.body ?? {});
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    if (!SESSION_STATUSES.has(status)) {
        res.status(400).json({ message: 'A valid session status is required.' });
        return;
    }
    const normalizePain = (value, fallback) => {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10) {
            return value;
        }
        return fallback;
    };
    const sanitizedExercises = Array.isArray(body.sessionExercises)
        ? body.sessionExercises
            .map((entry) => ({
            exerciseId: Number(entry?.exerciseId),
            sets: Number(entry?.sets),
            reps: Number(entry?.reps),
            resistance: typeof entry?.resistance === 'string' ? entry.resistance.trim() || null : null,
        }))
            .filter((entry) => Number.isInteger(entry.exerciseId) &&
            entry.exerciseId > 0 &&
            Number.isInteger(entry.sets) &&
            entry.sets > 0 &&
            Number.isInteger(entry.reps) &&
            entry.reps > 0)
        : [];
    const sanitizedOutcomes = Array.isArray(body.outcomeMeasures)
        ? body.outcomeMeasures
            .map((entry) => ({
            measureName: typeof entry?.measureName === 'string' ? entry.measureName.trim() : '',
            score: Number(entry?.score),
            takenOn: typeof entry?.takenOn === 'string' ? entry.takenOn : '',
            notes: typeof entry?.notes === 'string' ? entry.notes.trim() || null : null,
        }))
            .filter((entry) => entry.measureName &&
            !Number.isNaN(entry.score) &&
            entry.takenOn &&
            !Number.isNaN(Date.parse(entry.takenOn)))
        : [];
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [sessionRows] = await connection.query(`SELECT SessionID, PatientID, PainPre, PainPost, Notes
       FROM Sessions
       WHERE SessionID = :sessionId
         AND TherapistID = :therapistId
       LIMIT 1`, { sessionId, therapistId });
        if (sessionRows.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Session not found for this therapist.' });
            return;
        }
        const sessionRecord = sessionRows[0];
        const nextPainPre = normalizePain(body.painPre ?? null, sessionRecord.PainPre);
        const nextPainPost = normalizePain(body.painPost ?? null, sessionRecord.PainPost);
        const nextNotes = typeof body.notes === 'string' ? body.notes.trim() || null : sessionRecord.Notes;
        await connection.execute(`UPDATE Sessions
       SET Status = :status,
           Notes = :notes,
           PainPre = :painPre,
           PainPost = :painPost
       WHERE SessionID = :sessionId`, {
            status,
            notes: nextNotes,
            painPre: nextPainPre,
            painPost: nextPainPost,
            sessionId,
        });
        await connection.execute('DELETE FROM SessionExercises WHERE SessionID = :sessionId', {
            sessionId,
        });
        for (const exercise of sanitizedExercises) {
            await connection.execute(`INSERT INTO SessionExercises (SessionID, ExerciseID, Sets, Reps, Resistance)
         VALUES (:sessionId, :exerciseId, :sets, :reps, :resistance)`, {
                sessionId,
                exerciseId: exercise.exerciseId,
                sets: exercise.sets,
                reps: exercise.reps,
                resistance: exercise.resistance,
            });
        }
        for (const measure of sanitizedOutcomes) {
            await connection.execute(`INSERT INTO OutcomeMeasures (PatientID, MeasureName, Score, TakenOn, Notes)
         VALUES (:patientId, :measureName, :score, :takenOn, :notes)
         ON DUPLICATE KEY UPDATE
           Score = VALUES(Score),
           Notes = VALUES(Notes)`, {
                patientId: sessionRecord.PatientID,
                measureName: measure.measureName,
                score: measure.score,
                takenOn: measure.takenOn,
                notes: measure.notes,
            });
        }
        await connection.commit();
        res.json({ success: true });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unable to start this session.';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.post('/auth/signup', async (req, res) => {
    const { name, dob, phone, username, password } = req.body ?? {};
    const errors = [];
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!trimmedName)
        errors.push('Patient name is required.');
    if (typeof dob !== 'string' || Number.isNaN(Date.parse(dob)))
        errors.push('A valid date of birth is required.');
    if (!trimmedPhone)
        errors.push('A contact phone number is required.');
    if (!normalizedUsername)
        errors.push('A username is required.');
    if (typeof password !== 'string' || password.length < 8)
        errors.push('Password must be at least 8 characters.');
    if (errors.length > 0) {
        const message = errors.length === 1 ? errors[0] : `Invalid sign-up data. Please fix the following: ${errors.join(' ')}`;
        res.status(400).json({ message, errors });
        return;
    }
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.query('SELECT 1 FROM Users WHERE Username = :username LIMIT 1', { username: normalizedUsername });
        if (existing.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'Username already exists.' });
            return;
        }
        const [patientResult] = await connection.execute('INSERT INTO Patients (Name, DOB, Phone) VALUES (:name, :dob, :phone)', {
            name: trimmedName,
            dob,
            phone: trimmedPhone,
        });
        const patientId = patientResult.insertId;
        const { hash, salt } = await (0, auth_1.createPasswordRecord)(password);
        await connection.execute(`INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, PatientID)
       VALUES (:username, :hash, :salt, 'pending', :patientId)`, {
            username: normalizedUsername,
            hash,
            salt,
            patientId,
        });
        await connection.commit();
        res.status(201).json({
            patientId,
            username: normalizedUsername,
            patientName: trimmedName,
            role: 'pending',
            needsProfileCompletion: true,
        });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.get('/therapists/:therapistId/availability', async (req, res) => {
    const therapistId = Number(req.params.therapistId);
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!Number.isInteger(therapistId) || therapistId <= 0) {
        res.status(400).json({ message: 'A valid therapist ID is required.' });
        return;
    }
    if (!date || Number.isNaN(Date.parse(date))) {
        res.status(400).json({ message: 'A valid date query parameter is required.' });
        return;
    }
    try {
        const [therapistRows] = await db_1.default.query('SELECT Therapist.StaffID AS TherapistID, Staff.StaffName, Therapist.Specialty FROM Therapist INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID WHERE Therapist.StaffID = :therapistId LIMIT 1', { therapistId });
        if (therapistRows.length === 0) {
            res.status(404).json({ message: 'Therapist not found.' });
            return;
        }
        const [takenRows] = await db_1.default.query(`SELECT SessionTime
       FROM Sessions
       WHERE TherapistID = :therapistId
         AND SessionDate = :sessionDate
         AND Status <> 'Canceled'`, { therapistId, sessionDate: date });
        const taken = new Set(takenRows.map((row) => row.SessionTime));
        const available = ALLOWED_SLOTS.filter((slot) => !taken.has(slot)).map((slot) => slot.slice(0, 5));
        res.json({ therapistId, date, availableTimes: available });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
});
app.get('/patients/:patientId/sessions', async (req, res) => {
    const patientId = Number(req.params.patientId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
        res.status(400).json({ message: 'A valid patient ID is required.' });
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().slice(0, 10);
    try {
        const [upcomingRows] = await db_1.default.query(`SELECT SessionID,
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
       ORDER BY SessionDate ASC, SessionTime ASC`, { patientId });
        const [pastRows] = await db_1.default.query(`SELECT SessionID,
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
       LIMIT 10`, { patientId });
        const sessions = upcomingRows.map((row) => ({
            sessionId: row.SessionID,
            sessionDate: row.SessionDate,
            sessionTime: row.SessionTime.slice(0, 5),
            status: row.Status,
            painPre: row.PainPre,
            notes: row.Notes,
            therapistId: row.TherapistID,
            therapistName: row.TherapistName,
            specialty: row.Specialty,
        }));
        const pastSessions = pastRows.map((row) => ({
            sessionId: row.SessionID,
            sessionDate: row.SessionDate,
            sessionTime: row.SessionTime.slice(0, 5),
            status: row.Status,
            painPre: row.PainPre,
            notes: row.Notes,
            therapistId: row.TherapistID,
            therapistName: row.TherapistName,
            specialty: row.Specialty,
        }));
        res.json({ sessions, pastSessions });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
});
app.post('/patients/:patientId/onboarding', async (req, res) => {
    const patientId = Number(req.params.patientId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
        res.status(400).json({ message: 'A valid patient ID is required.' });
        return;
    }
    const { dxCode, referringProvider, referralDate } = req.body ?? {};
    const trimmedDxCode = typeof dxCode === 'string' ? dxCode.trim() : '';
    const trimmedProvider = typeof referringProvider === 'string' ? referringProvider.trim() : '';
    const providedDate = typeof referralDate === 'string' ? referralDate : '';
    const errors = [];
    if (!trimmedDxCode)
        errors.push('A diagnosis code is required.');
    if (!trimmedProvider)
        errors.push('A referring provider name is required.');
    if (providedDate && Number.isNaN(Date.parse(providedDate)))
        errors.push('Referral date must be a valid date.');
    if (errors.length > 0) {
        res.status(400).json({ message: errors.length === 1 ? errors[0] : 'Invalid onboarding data.', errors });
        return;
    }
    const referralDateValue = providedDate ? providedDate : new Date().toISOString().slice(0, 10);
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [patientRows] = await connection.query('SELECT Name FROM Patients WHERE PatientID = :patientId LIMIT 1', { patientId });
        if (patientRows.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Patient not found.' });
            return;
        }
        const [existingReferral] = await connection.query('SELECT ReferralID FROM Referrals WHERE PatientID = :patientId LIMIT 1', { patientId });
        if (existingReferral.length > 0) {
            await connection.execute(`UPDATE Referrals
         SET DxCode = :dxCode,
             ReferralDate = :referralDate,
             ReferringProvider = :referringProvider
         WHERE ReferralID = :referralId`, {
                dxCode: trimmedDxCode,
                referralDate: referralDateValue,
                referringProvider: trimmedProvider,
                referralId: existingReferral[0].ReferralID,
            });
        }
        else {
            await connection.execute(`INSERT INTO Referrals (PatientID, DxCode, ReferralDate, ReferringProvider)
         VALUES (:patientId, :dxCode, :referralDate, :referringProvider)`, {
                patientId,
                dxCode: trimmedDxCode,
                referralDate: referralDateValue,
                referringProvider: trimmedProvider,
            });
        }
        await connection.execute(`UPDATE Users
       SET Role = 'patient'
       WHERE PatientID = :patientId`, { patientId });
        await connection.commit();
        const patientName = patientRows[0].Name;
        res.json({
            patientId,
            patientName,
            role: 'patient',
            needsProfileCompletion: false,
        });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.post('/patients/:patientId/sessions', async (req, res) => {
    const patientId = Number(req.params.patientId);
    const { therapistId, sessionDate, sessionTime, painPre, notes } = req.body ?? {};
    if (!Number.isInteger(patientId) || patientId <= 0) {
        res.status(400).json({ message: 'A valid patient ID is required.' });
        return;
    }
    const normalizedTherapistId = Number(therapistId);
    if (!Number.isInteger(normalizedTherapistId) || normalizedTherapistId <= 0) {
        res.status(400).json({ message: 'A valid therapist ID is required.' });
        return;
    }
    if (typeof sessionDate !== 'string' || Number.isNaN(Date.parse(sessionDate))) {
        res.status(400).json({ message: 'A valid session date is required.' });
        return;
    }
    const normalizedTime = normalizeTimeInput(sessionTime);
    if (!normalizedTime || !ALLOWED_SLOTS.includes(normalizedTime)) {
        res.status(400).json({ message: 'Session time must be on the hour between 08:00 and 16:00.' });
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const desiredDate = new Date(sessionDate);
    if (desiredDate < today) {
        res.status(400).json({ message: 'Session date cannot be in the past.' });
        return;
    }
    const painValue = Number(painPre);
    if (!Number.isInteger(painValue) || painValue < 0 || painValue > 10) {
        res.status(400).json({ message: 'Pain level must be an integer between 0 and 10.' });
        return;
    }
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [patientRows] = await connection.query('SELECT PatientID FROM Patients WHERE PatientID = :patientId LIMIT 1', { patientId });
        if (patientRows.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Patient not found.' });
            return;
        }
        const [therapistRows] = await connection.query('SELECT StaffID FROM Therapist WHERE StaffID = :therapistId LIMIT 1', { therapistId: normalizedTherapistId });
        if (therapistRows.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Therapist not found.' });
            return;
        }
        const [patientConflict] = await connection.query(`SELECT SessionID
       FROM Sessions
       WHERE PatientID = :patientId
         AND SessionDate = :sessionDate
         AND Status <> 'Canceled'
       LIMIT 1`, { patientId, sessionDate });
        if (patientConflict.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'You already have a session scheduled for this date.' });
            return;
        }
        const [therapistConflict] = await connection.query(`SELECT SessionID
       FROM Sessions
       WHERE TherapistID = :therapistId
         AND SessionDate = :sessionDate
         AND SessionTime = :sessionTime
         AND Status <> 'Canceled'
       LIMIT 1`, { therapistId: normalizedTherapistId, sessionDate, sessionTime: normalizedTime });
        if (therapistConflict.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'This time is no longer available. Please choose another slot.' });
            return;
        }
        const [result] = await connection.execute(`INSERT INTO Sessions (PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes)
       VALUES (:patientId, :therapistId, :sessionDate, :sessionTime, 'Scheduled', :painPre, NULL, :notes)`, {
            patientId,
            therapistId: normalizedTherapistId,
            sessionDate,
            sessionTime: normalizedTime,
            painPre: painValue,
            notes: typeof notes === 'string' ? notes.trim() || null : null,
        });
        await connection.commit();
        res.status(201).json({
            sessionId: result.insertId,
            patientId,
            therapistId: normalizedTherapistId,
            sessionDate,
            sessionTime: normalizedTime.slice(0, 5),
            status: 'Scheduled',
            painPre: painValue,
        });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.patch('/patients/:patientId/sessions/:sessionId', async (req, res) => {
    const patientId = Number(req.params.patientId);
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
        res.status(400).json({ message: 'A valid patient ID is required.' });
        return;
    }
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
        res.status(400).json({ message: 'A valid session ID is required.' });
        return;
    }
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [existingRows] = await connection.query(`SELECT Sessions.SessionID,
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
       LIMIT 1`, { sessionId, patientId });
        if (existingRows.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Session not found.' });
            return;
        }
        const current = existingRows[0];
        const nextTherapistId = req.body?.therapistId !== undefined ? Number(req.body.therapistId) : current.TherapistID;
        if (!Number.isInteger(nextTherapistId) || nextTherapistId <= 0) {
            await connection.rollback();
            res.status(400).json({ message: 'A valid therapist ID is required.' });
            return;
        }
        if (req.body?.therapistId !== undefined) {
            const [therapistRows] = await connection.query('SELECT StaffID FROM Therapist WHERE StaffID = :therapistId LIMIT 1', { therapistId: nextTherapistId });
            if (therapistRows.length === 0) {
                await connection.rollback();
                res.status(404).json({ message: 'Therapist not found.' });
                return;
            }
        }
        const nextDate = typeof req.body?.sessionDate === 'string' ? req.body.sessionDate : current.SessionDate;
        if (Number.isNaN(Date.parse(nextDate))) {
            await connection.rollback();
            res.status(400).json({ message: 'A valid session date is required.' });
            return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const desiredDate = new Date(nextDate);
        if (desiredDate < today) {
            await connection.rollback();
            res.status(400).json({ message: 'Session date cannot be in the past.' });
            return;
        }
        const requestedTime = req.body?.sessionTime ?? current.SessionTime.slice(0, 5);
        const normalizedTime = normalizeTimeInput(requestedTime);
        if (!normalizedTime || !ALLOWED_SLOTS.includes(normalizedTime)) {
            await connection.rollback();
            res.status(400).json({ message: 'Session time must be on the hour between 08:00 and 16:00.' });
            return;
        }
        const painValue = req.body?.painPre !== undefined ? Number(req.body.painPre) : current.PainPre ?? undefined;
        if (painValue === undefined || !Number.isInteger(painValue) || painValue < 0 || painValue > 10) {
            await connection.rollback();
            res.status(400).json({ message: 'Pain level must be an integer between 0 and 10.' });
            return;
        }
        const nextStatus = typeof req.body?.status === 'string' ? req.body.status : current.Status;
        if (!SESSION_STATUSES.has(nextStatus)) {
            await connection.rollback();
            res.status(400).json({ message: 'Invalid session status.' });
            return;
        }
        const nextNotes = typeof req.body?.notes === 'string' ? req.body.notes.trim() || null : current.Notes;
        const [patientConflict] = await connection.query(`SELECT SessionID
       FROM Sessions
       WHERE PatientID = :patientId
         AND SessionDate = :sessionDate
         AND Status <> 'Canceled'
         AND SessionID <> :sessionId
       LIMIT 1`, { patientId, sessionDate: nextDate, sessionId });
        if (patientConflict.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'You already have another session scheduled on this date.' });
            return;
        }
        const [therapistConflict] = await connection.query(`SELECT SessionID
       FROM Sessions
       WHERE TherapistID = :therapistId
         AND SessionDate = :sessionDate
         AND SessionTime = :sessionTime
         AND Status <> 'Canceled'
         AND SessionID <> :sessionId
       LIMIT 1`, {
            therapistId: nextTherapistId,
            sessionDate: nextDate,
            sessionTime: normalizedTime,
            sessionId,
        });
        if (therapistConflict.length > 0) {
            await connection.rollback();
            res.status(409).json({ message: 'This time is no longer available. Please choose another slot.' });
            return;
        }
        await connection.execute(`UPDATE Sessions
       SET TherapistID = :therapistId,
           SessionDate = :sessionDate,
           SessionTime = :sessionTime,
           Status = :status,
           PainPre = :painPre,
           Notes = :notes
       WHERE SessionID = :sessionId`, {
            therapistId: nextTherapistId,
            sessionDate: nextDate,
            sessionTime: normalizedTime,
            status: nextStatus,
            painPre: painValue,
            notes: nextNotes,
            sessionId,
        });
        await connection.commit();
        res.json({
            sessionId,
            patientId,
            therapistId: nextTherapistId,
            sessionDate: nextDate,
            sessionTime: normalizedTime.slice(0, 5),
            status: nextStatus,
            painPre: painValue,
            notes: nextNotes,
        });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
    finally {
        connection.release();
    }
});
app.get('/admin/metrics', async (_req, res) => {
    try {
        const [noShowRows] = await db_1.default.query(`SELECT Therapist.StaffID AS TherapistID,
              Staff.StaffName,
              DATE_FORMAT(Sessions.SessionDate, '%Y-%m') AS MonthLabel,
              SUM(CASE WHEN Sessions.Status = 'No-Show' THEN 1 ELSE 0 END) AS NoShows,
              COUNT(*) AS TotalSessions
       FROM Sessions
       INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
       INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
       GROUP BY Therapist.StaffID, Staff.StaffName, MonthLabel
       ORDER BY MonthLabel ASC, Staff.StaffName ASC`);
        const [outcomeRows] = await db_1.default.query(`WITH ranked AS (
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
       ORDER BY Patients.Name ASC, ranked.MeasureName ASC`);
        const [exerciseRows] = await db_1.default.query(`SELECT Exercises.Name AS ExerciseName,
              COUNT(*) AS Prescriptions
       FROM SessionExercises
       INNER JOIN Exercises ON Exercises.ExerciseID = SessionExercises.ExerciseID
       WHERE Exercises.BodyRegion = 'Shoulder'
       GROUP BY Exercises.ExerciseID, Exercises.Name
       ORDER BY Prescriptions DESC, Exercises.Name ASC
       LIMIT 5`);
        const [outcomeDetailRows] = await db_1.default.query(`SELECT OutcomeMeasures.OutcomeID,
              OutcomeMeasures.PatientID,
              Patients.Name AS PatientName,
              OutcomeMeasures.MeasureName,
              OutcomeMeasures.Score,
              OutcomeMeasures.TakenOn,
              OutcomeMeasures.Notes
       FROM OutcomeMeasures
       INNER JOIN Patients ON Patients.PatientID = OutcomeMeasures.PatientID
       ORDER BY Patients.Name ASC, OutcomeMeasures.MeasureName ASC, OutcomeMeasures.TakenOn ASC`);
        const [exerciseOrderRows] = await db_1.default.query(`SELECT Exercises.Name AS ExerciseName,
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
       ORDER BY Exercises.Name ASC, Sessions.SessionDate DESC`);
        res.json({
            noShowRates: noShowRows.map((row) => ({
                therapistId: row.TherapistID,
                therapistName: row.StaffName,
                month: row.MonthLabel,
                totalSessions: Number(row.TotalSessions ?? 0),
                noShows: Number(row.NoShows ?? 0),
                rate: Number(row.TotalSessions ?? 0) > 0
                    ? Number(row.NoShows ?? 0) / Number(row.TotalSessions ?? 0)
                    : 0,
            })),
            outcomeChanges: outcomeRows.map((row) => ({
                patientId: row.PatientID,
                patientName: row.PatientName,
                measureName: row.MeasureName,
                baselineScore: row.BaselineScore === null ? null : Number(row.BaselineScore),
                latestScore: row.LatestScore === null ? null : Number(row.LatestScore),
                delta: row.Delta === null ? null : Number(row.Delta),
            })),
            topShoulderExercises: exerciseRows.map((row) => ({
                exerciseName: row.ExerciseName,
                prescriptions: Number(row.Prescriptions ?? 0),
            })),
            outcomeDetails: outcomeDetailRows.map((row) => ({
                outcomeId: row.OutcomeID,
                patientId: row.PatientID,
                patientName: row.PatientName,
                measureName: row.MeasureName,
                score: Number(row.Score),
                takenOn: row.TakenOn,
                notes: row.Notes,
            })),
            shoulderOrders: exerciseOrderRows.map((row) => ({
                exerciseName: row.ExerciseName,
                sessionId: row.SessionID,
                sessionDate: row.SessionDate,
                patientName: row.PatientName,
                therapistName: row.TherapistName,
            })),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message });
    }
});
const port = Number(process.env.PORT ?? '4000');
async function start() {
    await (0, db_1.waitForDatabase)();
    const dbName = await (0, db_1.verifyDatabase)();
    await (0, db_1.ensureUsersTable)();
    await (0, db_1.ensureReferralsConstraint)();
    await (0, db_1.ensureSessionsSchema)();
    await (0, db_1.ensureDerivedStructures)();
    console.info(`Connected to database: ${dbName ?? 'unknown'}`);
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}
start().catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map