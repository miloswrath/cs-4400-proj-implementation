export type PasswordRecord = {
    hash: Buffer;
    salt: Buffer;
};
export declare function createPasswordRecord(password: string): Promise<PasswordRecord>;
export declare function verifyPassword(password: string, hash: Buffer, salt: Buffer): Promise<boolean>;
//# sourceMappingURL=auth.d.ts.map