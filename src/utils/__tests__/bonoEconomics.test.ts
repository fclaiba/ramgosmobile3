const {
  assertBonoEconomics,
  resolveBonoEconomics,
  DEFAULT_BONO_PAID,
  DEFAULT_BONO_CREDIT,
  DEFAULT_BONO_VALIDITY_DAYS,
} = require('../../../convex/bonoEconomics');

describe('bonoEconomics (prepaid credit)', () => {
  it('defaults validity to 4 days', () => {
    expect(DEFAULT_BONO_VALIDITY_DAYS).toBe(4);
  });

  it('accepts pay 50 / credit 100', () => {
    expect(() =>
      assertBonoEconomics({ price: 50, discountValue: 100 }),
    ).not.toThrow();
  });

  it('rejects percent discount model', () => {
    expect(() =>
      assertBonoEconomics({
        price: 50,
        discountValue: 100,
        discountPercent: 40,
      }),
    ).toThrow(/porcentual/i);
  });

  it('rejects price 0', () => {
    expect(() =>
      assertBonoEconomics({ price: 0, discountValue: 100 }),
    ).toThrow(/mayor a 0/i);
  });

  it('rejects credit <= paid', () => {
    expect(() =>
      assertBonoEconomics({ price: 50, discountValue: 50 }),
    ).toThrow(/el doble/i);
    expect(() =>
      assertBonoEconomics({ price: 100, discountValue: 50 }),
    ).toThrow(/el doble/i);
  });

  it('rejects credit that is not exactly the double (ni un poco más, ni un poco menos)', () => {
    expect(() =>
      assertBonoEconomics({ price: 50, discountValue: 51 }),
    ).toThrow(/el doble/i);
    expect(() =>
      assertBonoEconomics({ price: 50, discountValue: 150 }),
    ).toThrow(/el doble/i);
  });

  it('acepta cualquier monto, siempre que el crédito sea exactamente el doble', () => {
    expect(() =>
      assertBonoEconomics({ price: 20, discountValue: 40 }),
    ).not.toThrow();
    expect(() =>
      assertBonoEconomics({ price: 30, discountValue: 60 }),
    ).not.toThrow();
  });

  it('rejects missing credit', () => {
    expect(() => assertBonoEconomics({ price: 50 })).toThrow(/crédito/i);
  });

  it('resolveBonoEconomics maps listing fields', () => {
    expect(
      resolveBonoEconomics({ price: 50, discountValue: 100 }),
    ).toEqual({
      paidAmount: 50,
      creditTotal: 100,
      creditRemaining: 100,
      usesTotal: 1,
      usesRemaining: 1,
    });
  });

  it('resolveBonoEconomics falls back to defaults when invalid', () => {
    const eco = resolveBonoEconomics({ price: 0, discountValue: 0 });
    expect(eco.paidAmount).toBe(DEFAULT_BONO_PAID);
    expect(eco.creditTotal).toBe(DEFAULT_BONO_CREDIT);
  });
});
