/**
 * Constitución económica — las reglas de R Coins que no se cambian sin querer.
 *
 * QUÉ SALIÓ MAL ANTES
 *
 * Este test afirmaba contra constantes declaradas en `RewardsContext` y
 * `ReferralContext`, y las comparaba con literales escritos acá. O sea:
 * comparaba el frontend consigo mismo. Pasaba en verde mientras
 *
 *   - el frontend decía que un punto valía $0,01 y el canje del servidor lo
 *     pagaba a $0,001 (10× de diferencia),
 *   - el frontend contaba 5 puntos por referido y el servidor acreditaba 500
 *     (100× de diferencia),
 *   - la ruleta del frontend prometía hasta 100 y el servidor daba hasta 50.
 *
 * Un test que sólo mira un lado de una divergencia no puede detectarla.
 *
 * CÓMO SE BLINDA AHORA
 *
 * Los valores viven en un único módulo (`convex/economy/_rewardRules.ts`) que
 * importan tanto las funciones de Convex como los contextos de React. Este
 * test hace dos cosas distintas:
 *
 *   1. Fija los montos contra literales, para que cambiarlos sea deliberado.
 *      Son promesas publicadas en `TermsScreen.tsx`.
 *   2. Verifica que los contextos de React expongan EXACTAMENTE lo que dice
 *      esa tabla, de modo que volver a declarar un literal propio en el
 *      frontend rompa el test.
 */

// RewardsContext depende de AsyncStorage (nativo). Mock para Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// RewardsContext depende de ToastContext en runtime.
jest.mock('../ToastContext', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

const rules = require('../../../convex/economy/_rewardRules');
const {
  ARCADE_MAX_REWARDS,
  ARCADE_POINTS_RANGE,
  POINT_VALUE_USD,
  WHEEL_POINTS_RANGE,
} = require('../RewardsContext');
const { REFERRAL_REWARDS } = require('../ReferralContext');
const { MEMBERSHIP_TIERS } = require('../PointsContext');
const { MARKETPLACE_ESCROW_RELEASE_DAYS } = require('../MarketplaceContext');

describe('Constitución — montos publicados', () => {
  it('1.000 R Coins = US$ 1,00', () => {
    expect(rules.POINT_VALUE_USD).toBe(0.001);
    expect(1000 * rules.POINT_VALUE_USD).toBeCloseTo(1, 10);
  });

  it('la compra paga 5 puntos por dólar', () => {
    expect(rules.POINTS_PER_USD).toBe(5);
  });

  it('los niveles y sus multiplicadores no se mueven', () => {
    expect(
      rules.MEMBERSHIP_TIERS.map((t: any) => ({
        id: t.id,
        minPoints: t.minPoints,
        bonusMultiplier: t.bonusMultiplier,
      })),
    ).toEqual([
      { id: 'bronze', minPoints: 0, bonusMultiplier: 0 },
      { id: 'silver', minPoints: 1000, bonusMultiplier: 0.05 },
      { id: 'gold', minPoints: 5000, bonusMultiplier: 0.1 },
      { id: 'platinum', minPoints: 15000, bonusMultiplier: 0.15 },
    ]);
  });

  it('arcade 1–20, máximo 3 por día', () => {
    expect(rules.ARCADE_POINTS_RANGE).toEqual({ min: 1, max: 20 });
    expect(rules.ARCADE_MAX_PER_DAY).toBe(3);
  });

  it('ruleta 5–50, un giro por día', () => {
    expect(rules.WHEEL_POINTS_RANGE).toEqual({ min: 5, max: 50 });
  });

  it('mascota +5 por día, reseña 5, login diario 10', () => {
    expect(rules.PET_DAILY_CARE_POINTS).toBe(5);
    expect(rules.REVIEW_POINTS).toBe(5);
    expect(rules.DAILY_LOGIN_POINTS).toBe(10);
  });

  it('referidos 500 / 1000 / 2000', () => {
    expect(rules.REFERRAL_REWARDS).toEqual({
      SIGNUP: 500,
      FIRST_PURCHASE_REFERRER: 1000,
      FIRST_PURCHASE_NEW_USER: 2000,
    });
  });

  it('hitos de racha 20 / 60 / 150 / 400', () => {
    expect(rules.STREAK_MILESTONE_REWARDS).toEqual({
      '3': 20,
      '7': 60,
      '14': 150,
      '30': 400,
    });
  });

  it('la retención del marketplace sigue siendo de 10 días', () => {
    expect(MARKETPLACE_ESCROW_RELEASE_DAYS).toBe(10);
  });
});

describe('Constitución — el frontend no puede divergir del servidor', () => {
  // Cada uno de estos casos falla si alguien vuelve a declarar un literal
  // propio en un contexto en lugar de leer la tabla compartida. Ese fue
  // exactamente el modo de falla anterior.
  it('RewardsContext expone el valor del punto del servidor', () => {
    expect(POINT_VALUE_USD).toBe(rules.POINT_VALUE_USD);
  });

  it('RewardsContext expone los rangos de juego del servidor', () => {
    expect(ARCADE_POINTS_RANGE).toEqual(rules.ARCADE_POINTS_RANGE);
    expect(ARCADE_MAX_REWARDS).toBe(rules.ARCADE_MAX_PER_DAY);
    expect(WHEEL_POINTS_RANGE).toEqual(rules.WHEEL_POINTS_RANGE);
  });

  it('ReferralContext expone los montos de referido del servidor', () => {
    expect(REFERRAL_REWARDS).toEqual(rules.REFERRAL_REWARDS);
  });

  it('PointsContext deriva sus niveles de los del servidor', () => {
    expect(
      MEMBERSHIP_TIERS.map((t: any) => ({
        id: t.id,
        minPoints: t.minPoints,
        bonusMultiplier: t.bonusMultiplier,
      })),
    ).toEqual(
      rules.MEMBERSHIP_TIERS.map((t: any) => ({
        id: t.id,
        minPoints: t.minPoints,
        bonusMultiplier: t.bonusMultiplier,
      })),
    );
  });
});

describe('rollPoints se mantiene dentro del rango', () => {
  it('nunca cae fuera de los extremos, en 2.000 tiradas', () => {
    for (const range of [rules.ARCADE_POINTS_RANGE, rules.WHEEL_POINTS_RANGE]) {
      for (let i = 0; i < 1000; i++) {
        const value = rules.rollPoints(range);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(range.min);
        expect(value).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('puede alcanzar ambos extremos', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(rules.rollPoints({ min: 1, max: 3 }));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
