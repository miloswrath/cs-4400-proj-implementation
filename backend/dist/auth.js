"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPasswordRecord = createPasswordRecord;
exports.verifyPassword = verifyPassword;
const crypto_1 = __importDefault(require("crypto"));
const ITERATIONS = Number(process.env.PBKDF2_ITERATIONS ?? '210000');
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
function pbkdf2(password, salt) {
    return new Promise((resolve, reject) => {
        crypto_1.default.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (error, derivedKey) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(derivedKey);
            }
        });
    });
}
async function createPasswordRecord(password) {
    const salt = crypto_1.default.randomBytes(16);
    const hash = await pbkdf2(password, salt);
    return { hash, salt };
}
async function verifyPassword(password, hash, salt) {
    const derived = await pbkdf2(password, salt);
    return crypto_1.default.timingSafeEqual(derived, hash);
}
//# sourceMappingURL=auth.js.map