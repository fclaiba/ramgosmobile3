// RewardsContext depends on AsyncStorage (native). Mock it for Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// RewardsContext depends on ToastContext at runtime.
jest.mock('../ToastContext', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

const { ARCADE_MAX_REWARDS, ARCADE_POINTS_RANGE, POINT_VALUE_USD, WHEEL_POINTS_RANGE } = require('../RewardsContext');
const { REFERRAL_REWARDS, REFERRAL_WELCOME_BONUS } = require('../ReferralContext');
const { MEMBERSHIP_TIERS } = require('../PointsContext');
const { MARKETPLACE_ESCROW_RELEASE_DAYS } = require('../MarketplaceContext');

describe('Constitution (Rewards v2)', () => {
  it('keeps point conversion value exact', () => {
    expect(POINT_VALUE_USD).toBe(0.01);
  });

  it('keeps tiers exact', () => {
    const tiers = MEMBERSHIP_TIERS.map((t: any) => ({
      id: t.id,
      minPoints: t.minPoints,
      bonusMultiplier: t.bonusMultiplier,
    }));

    expect(tiers).toEqual([
      { id: 'bronze', minPoints: 0, bonusMultiplier: 0 },
      { id: 'silver', minPoints: 1000, bonusMultiplier: 0.05 },
      { id: 'gold', minPoints: 5000, bonusMultiplier: 0.1 },
      { id: 'platinum', minPoints: 15000, bonusMultiplier: 0.15 },
    ]);
  });

  it('keeps arcade rules exact (1–20, max 3/day)', () => {
    expect(ARCADE_MAX_REWARDS).toBe(3);
    expect(ARCADE_POINTS_RANGE).toEqual({ min: 1, max: 20 });
  });

  it('keeps wheel rules exact (5–100, 1/day)', () => {
    expect(WHEEL_POINTS_RANGE).toEqual({ min: 5, max: 100 });
  });

  it('keeps referral rewards exact (5/10/25 + welcome 10)', () => {
    expect(REFERRAL_REWARDS).toEqual({
      REGISTER: 5,
      FIRST_PURCHASE: 10,
      HIGH_TICKET: 25,
    });
    expect(REFERRAL_WELCOME_BONUS).toBe(10);
  });

  it('keeps escrow release window exact (10 days)', () => {
    expect(MARKETPLACE_ESCROW_RELEASE_DAYS).toBe(10);
  });
});

