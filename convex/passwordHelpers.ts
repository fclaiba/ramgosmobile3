// ponytail: bcryptjs uses setTimeout — forbidden in Convex mutations/actions isolate.
// Legacy reversible hash is dev/MVP only; move hashing to a Node action before prod.
const LEGACY_PREFIX = "hashed_";

export const hashPassword = (password: string): string =>
    `${LEGACY_PREFIX}${password.split("").reverse().join("")}`;

export const isLegacyPasswordHash = (passwordHash: string): boolean =>
    passwordHash.startsWith(LEGACY_PREFIX);

export const verifyLegacyPassword = (
    password: string,
    passwordHash: string,
): boolean =>
    passwordHash ===
    `${LEGACY_PREFIX}${password.split("").reverse().join("")}`;

export const verifyPassword = (
    password: string,
    passwordHash: string,
): boolean => {
    if (!passwordHash) return false;
    if (isLegacyPasswordHash(passwordHash)) {
        return verifyLegacyPassword(password, passwordHash);
    }
    // Old bcrypt hashes from a prior deploy can't be checked here.
    return false;
};
