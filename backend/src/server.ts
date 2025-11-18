import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { createPasswordRecord, verifyPassword } from './auth';
import pool, { verifyDatabase } from './db';

dotenv.config();

const app = express();
app.use(express.json());

const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : undefined,
    credentials: true,
  }),
);

app.get('/health', async (_req, res) => {
  try {
    const [result] = await pool.query('SELECT 1');
    const database = await verifyDatabase();
    res.json({ status: 'ok', database, ping: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ status: 'error', message });
  }
});

type UserRow = RowDataPacket & {
  UserID: number;
  Username: string;
  PasswordHash: Buffer;
  PasswordSalt: Buffer;
  Role: string;
  PatientID: number | null;
};

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ message: 'Username and password are required.' });
    return;
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    const [rows] = await pool.query<UserRow[]>(
      `SELECT UserID, Username, PasswordHash, PasswordSalt, Role, PatientID
       FROM Users
       WHERE Username = :username
       LIMIT 1`,
      { username: normalizedUsername },
    );

    if (rows.length === 0) {
      res.status(401).json({ message: 'Invalid username or password.' });
      return;
    }

    const user = rows[0]!;
    const isValid = await verifyPassword(password, user.PasswordHash, user.PasswordSalt);

    if (!isValid) {
      res.status(401).json({ message: 'Invalid username or password.' });
      return;
    }

    res.json({ userId: user.UserID, username: user.Username, role: user.Role, patientId: user.PatientID });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
});

app.post('/auth/signup', async (req, res) => {
  const { name, dob, phone, username, password } = req.body ?? {};
  const errors: string[] = [];

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';

  if (!trimmedName) errors.push('Patient name is required.');
  if (typeof dob !== 'string' || Number.isNaN(Date.parse(dob))) errors.push('A valid date of birth is required.');
  if (!trimmedPhone) errors.push('A contact phone number is required.');
  if (!normalizedUsername) errors.push('A username is required.');
  if (typeof password !== 'string' || password.length < 8) errors.push('Password must be at least 8 characters.');

  if (errors.length > 0) {
    res.status(400).json({ message: 'Invalid sign-up data.', errors });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT 1 FROM Users WHERE Username = :username LIMIT 1',
      { username: normalizedUsername },
    );

    if (existing.length > 0) {
      await connection.rollback();
      res.status(409).json({ message: 'Username already exists.' });
      return;
    }

    const [patientResult] = await connection.execute<ResultSetHeader>(
      'INSERT INTO Patients (Name, DOB, Phone) VALUES (:name, :dob, :phone)',
      {
        name: trimmedName,
        dob,
        phone: trimmedPhone,
      },
    );

    const patientId = patientResult.insertId;
    const { hash, salt } = await createPasswordRecord(password);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO Users (Username, PasswordHash, PasswordSalt, Role, PatientID)
       VALUES (:username, :hash, :salt, 'patient', :patientId)`,
      {
        username: normalizedUsername,
        hash,
        salt,
        patientId,
      },
    );

    await connection.commit();

    res.status(201).json({ patientId, username: normalizedUsername });
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  } finally {
    connection.release();
  }
});

const port = Number(process.env.PORT ?? '4000');

async function start() {
  const dbName = await verifyDatabase();
  console.info(`Connected to database: ${dbName ?? 'unknown'}`);

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
