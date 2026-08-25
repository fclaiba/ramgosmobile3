/**
 * Reglas económicas de R Coins — fuente única de verdad.
 *
 * POR QUÉ EXISTE
 *
 * Los mismos números vivían copiados en cuatro lugares que se contradecían
 * entre sí y contra lo que la app le promete al usuario en los términos:
 *
 *   | Regla              | RewardsContext | ReferralContext | Servidor | Términos |
 *   |--------------------|----------------|-----------------|----------|----------|
 *   | Valor del punto    | $0.01          | —               | $0.001   | $0.001   |
 *   | Referido alta      | —              | 5               | 500      | —        |
 *   | Referido 1ª compra | 100 / 250      | 10 / 25         | 1000     | —        |
 *   | Ruleta             | 5–100          | —               | 5–50     | —        |
 *
 * El test `constitution.test.tsx` afirmaba contra los valores del frontend
 * comparándolos consigo mismos, así que pasaba en verde mientras el servidor
 * otorgaba 100× en referidos y la pantalla de referidos mostraba cifras que no
 * eran las acreditadas.
 *
 * La corrección no es sincronizar cuatro tablas a mano —eso se vuelve a
 * desincronizar— sino que haya una sola. Este módulo es esa tabla, y lo
 * importan tanto las funciones de Convex como los contextos de React.
 *
 * Los valores son los de los términos publicados (`src/screens/TermsScreen.tsx`
 * §5), que es el compromiso que el usuario aceptó. Donde los términos no dicen
 * nada, manda lo que el servidor ya venía otorgando.
 *
 * CÓMO SE USA
 *
 * Es un módulo puro: sin imports de Convex, sin `query`/`mutation`. El prefijo
 * `_` mantiene el archivo fuera del registro de funciones de Convex, igual que
 * `convex/social/_communityPolicy.ts`. Por eso puede importarse desde `src/`
 * sin arrastrar el runtime del servidor.
 *
 * SI CAMBIÁS UN NÚMERO ACÁ, actualizá también `TermsScreen.tsx`: son la misma
 * promesa escrita dos veces, una para el código y otra para el usuario.
 */

/**
 * Valor de canje de un punto, en dólares. 1.000 R Coins = US$ 1,00.
 *
 * Es el número que usa `redeemPoints` para calcular el descuento, así que
 * cambiarlo revalúa todos los saldos existentes.
 */
export const POINT_VALUE_USD = 0.001;

/** Puntos base por dólar gastado. Con el valor de arriba, 0,5% de cashback. */
export const POINTS_PER_USD = 5;

/**
 * Niveles de membresía. El multiplicador se aplica sobre los puntos por compra.
 * `lifetimePoints` (no el saldo actual) es lo que determina el nivel: gastar
 * puntos no debería bajarte de categoría.
 */
export const MEMBERSHIP_TIERS = [
    { id: 'bronze', label: 'Bronze', minPoints: 0, bonusMultiplier: 0 },
    { id: 'silver', label: 'Silver', minPoints: 1000, bonusMultiplier: 0.05 },
    { id: 'gold', label: 'Gold', minPoints: 5000, bonusMultiplier: 0.1 },
    { id: 'platinum', label: 'Platinum', minPoints: 15000, bonusMultiplier: 0.15 },
] as const;

/** Multiplicador de bonificación para un `lifetimePoints` dado. */
export function bonusMultiplierFor(lifetimePoints: number): number {
    let bonus = 0;
    for (const tier of MEMBERSHIP_TIERS) {
        if (lifetimePoints >= tier.minPoints) bonus = tier.bonusMultiplier;
    }
    return bonus;
}

/** Ruleta de la suerte: un giro por día, premio en este rango. */
export const WHEEL_POINTS_RANGE = { min: 5, max: 50 } as const;

/**
 * Arcade: hasta 3 reclamos por día, premio en este rango.
 *
 * El premio se sortea EN EL SERVIDOR y no se deriva del puntaje del juego. El
 * puntaje lo reporta el cliente, así que atarle el monto volvería a dejar la
 * cifra en manos del cliente — el agujero que se cerró cuando esto pasó a ser
 * un valor plano. El rango 1–20 es el que publican los términos; sortearlo
 * cumple la promesa sin devolverle el control al cliente.
 */
export const ARCADE_POINTS_RANGE = { min: 1, max: 20 } as const;
export const ARCADE_MAX_PER_DAY = 3;

/** Cuidado diario de la mascota virtual. Los términos publican +5/día. */
export const PET_DAILY_CARE_POINTS = 5;

/** Inicio de sesión diario. */
export const DAILY_LOGIN_POINTS = 10;

/** Dejar una reseña. */
export const REVIEW_POINTS = 5;

/**
 * Referidos. Los otorga el servidor en el alta y en la primera compra
 * (`convex/users.ts`), nunca el cliente: sólo el servidor sabe quién invitó
 * a quién de verdad.
 */
export const REFERRAL_REWARDS = {
    /** Al referido completar KYC. Va al referidor. */
    SIGNUP: 500,
    /** Primera compra del referido. Va al referidor. */
    FIRST_PURCHASE_REFERRER: 1000,
    /** Primera compra del referido. Va al usuario nuevo. */
    FIRST_PURCHASE_NEW_USER: 2000,
} as const;

/** Hitos de racha de login, en días. */
export const STREAK_MILESTONE_REWARDS: Record<string, number> = {
    '3': 20,
    '7': 60,
    '14': 150,
    '30': 400,
};

/** Sortea un premio entero dentro de un rango, ambos extremos incluidos. */
export function rollPoints(range: { min: number; max: number }): number {
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}
