/**
 * Dual-referral anti-fraud helpers (pure).
 * Mirrors convex/referralHelpers.ts — keep in sync with backend rules.
 */
const {
  REFERRAL_ALIAS_MIN,
  REFERRAL_ALIAS_MAX,
  normalizeReferralAlias,
  normalizeReferralInput,
  validateReferralAliasFormat,
  preferredShareCode,
  isAliasCooldownActive,
  REFERRAL_ALIAS_COOLDOWN_MS,
} = require('../../../convex/referralHelpers');

describe('referralHelpers (dual referral)', () => {
  it('normalizes vanity alias to uppercase A-Z0-9-hyphen', () => {
    expect(normalizeReferralAlias('  juan_123!  ')).toBe('JUAN123');
    expect(normalizeReferralAlias('mi-codigo')).toBe('MI-CODIGO');
    expect(normalizeReferralAlias('a'.repeat(20)).length).toBe(REFERRAL_ALIAS_MAX);
  });

  it('strips @ from invite input', () => {
    expect(normalizeReferralInput('@juan')).toBe('juan');
    expect(normalizeReferralInput('  @@RAMGOS  ')).toBe('RAMGOS');
  });

  it('rejects blacklisted and own-username aliases', () => {
    expect(validateReferralAliasFormat('ADMIN')).toBe('blacklisted');
    expect(validateReferralAliasFormat('RAMGOS')).toBe('blacklisted');
    expect(validateReferralAliasFormat('JUAN', 'juan')).toBe('same_as_own_username');
    expect(validateReferralAliasFormat('OK')).toBe('too_short');
    expect(validateReferralAliasFormat('GOODCODE', 'juan')).toBeNull();
    expect(validateReferralAliasFormat('')).toBeNull(); // clear allowed
  });

  it('prefers alias over username for share code', () => {
    expect(preferredShareCode('juan', 'MIALIAS')).toBe('MIALIAS');
    expect(preferredShareCode('juan', '')).toBe('juan');
    expect(preferredShareCode('juan', null)).toBe('juan');
  });

  it('enforces 30-day alias cooldown', () => {
    const now = Date.UTC(2026, 7, 6);
    expect(isAliasCooldownActive(undefined, now)).toBe(false);
    expect(isAliasCooldownActive(now - 1000, now)).toBe(true);
    expect(isAliasCooldownActive(now - REFERRAL_ALIAS_COOLDOWN_MS - 1, now)).toBe(false);
    expect(REFERRAL_ALIAS_MIN).toBe(3);
    expect(REFERRAL_ALIAS_MAX).toBe(15);
  });
});
