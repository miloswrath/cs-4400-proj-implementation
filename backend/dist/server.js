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
              Patients.Name AS PatientName
       FROM Users
       LEFT JOIN Patients ON Patients.PatientID = Users.PatientID
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
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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
        const [rows] = await db_1.default.query(`SELECT Sessions.SessionID,
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
       ORDER BY Sessions.SessionDate ASC, Sessions.SessionTime ASC`, { patientId, today: todayString });
        const sessions = rows.map((row) => ({
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
        res.json({ sessions });
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
const port = Number(process.env.PORT ?? '4000');
async function start() {
    const dbName = await (0, db_1.verifyDatabase)();
    await (0, db_1.ensureUsersTable)();
    await (0, db_1.ensureReferralsConstraint)();
    await (0, db_1.ensureSessionsSchema)();
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