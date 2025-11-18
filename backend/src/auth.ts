import crypto from 'crypto';

const ITERATIONS = Number(process.env.PBKDF2_ITERATIONS ?? '210000');
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export type PasswordRecord = {
  hash: Buffer;
  salt: Buffer;
};

function pbkdf2(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export async function createPasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(password, salt);
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: Buffer, salt: Buffer): Promise<boolean> {
  const derived = await pbkdf2(password, salt);
  return crypto.timingSafeEqual(derived, hash);
}
