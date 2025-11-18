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
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ message: 'Username and password are required.' });
        return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    try {
        const [rows] = await db_1.default.query(`SELECT UserID, Username, PasswordHash, PasswordSalt, Role, PatientID
       FROM Users
       WHERE Username = :username
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
        res.json({ userId: user.UserID, username: user.Username, role: user.Role, patientId: user.PatientID });
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
        res.status(400).json({ message: 'Invalid sign-up data.', errors });
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
       VALUES (:username, :hash, :salt, 'patient', :patientId)`, {
            username: normalizedUsername,
            hash,
            salt,
            patientId,
        });
        await connection.commit();
        res.status(201).json({ patientId, username: normalizedUsername });
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