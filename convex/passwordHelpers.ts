import { compare, hash } from "bcryptjs";

const BCRYPT_ROUNDS = 10;
const LEGACY_PREFIX = "hashed_";

export const hashPassword = (password: string): Promise<string> =>
    hash(password, BCRYPT_ROUNDS);

export const isLegacyPasswordHash = (passwordHash: string): boolean =>
    passwordHash.startsWith(LEGACY_PREFIX);

export const verifyLegacyPassword = (
    password: string,
    passwordHash: string,
): boolean =>
    passwordHash ===
    `${LEGACY_PREFIX}${password.split("").reverse().join("")}`;

export const verifyPassword = async (
    password: string,
    passwordHash: string,
): Promise<boolean> => {
    if (isLegacyPasswordHash(passwordHash)) {
        return verifyLegacyPassword(password, passwordHash);
    }

    try {
        return await compare(password, passwordHash);
    } catch {
        return false;
    }
};
