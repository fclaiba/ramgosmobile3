/**
 * Ciclo de vida de la mascota: incubación del huevo y desgaste por el tiempo.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Antes había tres modelos contradictorios y ninguno usaba el reloj:
 *
 *   1. El huevo "eclosionaba" al tener ≥100 monedas dentro de `addCoins`. Como
 *      el estado por defecto arranca con 100 monedas, eclosionaba con la
 *      primera moneda que ganabas: no había incubación en absoluto.
 *   2. El modal de guía prometía que la mascota evolucionaba manteniendo la
 *      racha diaria. `loginStreak` no se leía en ninguna parte.
 *   3. El desgaste era un `setInterval` en el cliente, en memoria: se perdía al
 *      cerrar la pantalla y lo pisaba el siguiente update del servidor. Cerrar
 *      la app congelaba la mascota.
 *
 * ── Cómo funciona ahora ───────────────────────────────────────────────────
 * Todo se deriva de timestamps, en el servidor, sin cron. El estado guarda
 * *cuándo* pasó la última liquidación; al leer o mutar se calcula qué debería
 * haber pasado desde entonces. Es la forma barata de simular tiempo continuo:
 * un cron que tocara cada mascota cada hora costaría escrituras por usuario
 * inactivo, y este cálculo cuesta cero mientras nadie mire.
 *
 * Las funciones son puras (estado + `nowMs` → estado nuevo) para poder testear
 * "pasaron 40 horas" sin tocar la base ni el reloj real.
 */

/** Cuánto tarda el huevo en romperse solo, sin ningún cuidado. */
export const EGG_INCUBATION_HOURS = 48;

/** Cuánto progreso suma cada acción de cuidado sobre el huevo. */
export const EGG_CARE_BOOST = 5;
export const EGG_DAILY_LOGIN_BOOST = 10;

/** El huevo pasa a nivel 3, que es donde el cliente lo considera nacido. */
export const HATCHED_LEVEL = 3;

/**
 * Puntos de stat que se pierden por hora sin atención. Calibrado para que un
 * día sin entrar se note pero no arruine: 24h dejan el hambre a la mitad.
 */
export const DECAY_PER_HOUR = {
    hunger: 2,
    energy: 1.5,
    hygiene: 1.2,
    happiness: 1,
} as const;

/**
 * Tope de horas que se liquidan de una vez. Sin esto, volver después de un mes
 * dejaría todo en cero y la mascota se sentiría muerta e irrecuperable; con
 * esto, tres días de abandono es el peor caso posible.
 */
export const DECAY_CAP_HOURS = 72;

/** Umbrales de humor, compartidos con la UI para que el texto no mienta. */
export const NEED_THRESHOLDS = {
    hungry: 25,
    sleepy: 25,
    dirty: 30,
} as const;

const MS_PER_HOUR = 3_600_000;

const clamp = (value: number, min = 0, max = 100) =>
    Math.max(min, Math.min(max, value));

const hoursBetween = (fromIso: string | null | undefined, nowMs: number): number => {
    if (!fromIso) return 0;
    const from = new Date(fromIso).getTime();
    if (!Number.isFinite(from)) return 0;
    return Math.max(0, (nowMs - from) / MS_PER_HOUR);
};

export type PetNeed = 'hungry' | 'dirty' | 'sleepy' | null;

/**
 * Progreso de incubación 0..100.
 *
 * Es tiempo transcurrido + lo que el usuario aceleró cuidándolo. `eggCareBoost`
 * se acumula aparte del reloj para que cuidar el huevo se sienta, pero sin
 * poder saltearlo entero: cada acción vale 5 puntos y hay tope diario de
 * monedas, así que el piso realista sigue siendo del orden de un día.
 */
export function computeEggProgress(state: any, nowMs: number): number {
    const startedAt = state?.eggStartedAt ?? null;
    if (!startedAt) return clamp(Number(state?.eggCareBoost) || 0);

    const elapsed = hoursBetween(startedAt, nowMs);
    const fromTime = (elapsed / EGG_INCUBATION_HOURS) * 100;
    const fromCare = Number(state?.eggCareBoost) || 0;
    return clamp(fromTime + fromCare);
}

/** ¿El estado todavía está en etapa huevo? */
export const isEggStage = (state: any): boolean =>
    (Number(state?.petStats?.level) || 1) < HATCHED_LEVEL;

/** Qué necesita la mascota ahora mismo, en orden de urgencia. */
export function primaryNeed(petStats: any): PetNeed {
    if ((petStats?.hunger ?? 100) < NEED_THRESHOLDS.hungry) return 'hungry';
    if ((petStats?.hygiene ?? 100) < NEED_THRESHOLDS.dirty) return 'dirty';
    if ((petStats?.energy ?? 100) < NEED_THRESHOLDS.sleepy) return 'sleepy';
    return null;
}

export type SettleResult = {
    state: any;
    /** true sólo en la liquidación donde el huevo se rompe. */
    hatched: boolean;
    /** true si algo cambió y vale la pena escribir. */
    changed: boolean;
};

/**
 * Pone el estado al día contra el reloj. Idempotente: llamarla dos veces
 * seguidas con el mismo `nowMs` no cambia nada la segunda vez.
 *
 * En etapa huevo sólo avanza la incubación (un huevo no tiene hambre). Después
 * de nacer, aplica el desgaste de las horas transcurridas desde `lastTickAt`.
 */
export function settlePetState(state: any, nowMs: number): SettleResult {
    const nowIso = new Date(nowMs).toISOString();
    const petStats = { ...(state?.petStats || {}) };

    // Higiene es un stat nuevo: los estados viejos no lo tienen.
    if (!Number.isFinite(petStats.hygiene)) petStats.hygiene = 80;

    if (isEggStage(state)) {
        // Arranca el reloj la primera vez que vemos este huevo. No se puede
        // hacer en el default porque ahí no hay "primera vez": el documento se
        // crea cuando el usuario se registra y podría no abrir la app en días.
        const eggStartedAt = state?.eggStartedAt ?? nowIso;
        const progress = computeEggProgress({ ...state, eggStartedAt }, nowMs);

        if (progress >= 100) {
            return {
                state: {
                    ...state,
                    eggStartedAt,
                    petStats: {
                        ...petStats,
                        level: HATCHED_LEVEL,
                        exp: 0,
                        happiness: 100,
                        hunger: 100,
                        energy: 100,
                        hygiene: 100,
                    },
                    lastTickAt: nowIso,
                },
                hatched: true,
                changed: true,
            };
        }

        return {
            state: { ...state, eggStartedAt, petStats },
            hatched: false,
            changed: state?.eggStartedAt !== eggStartedAt || !Number.isFinite(state?.petStats?.hygiene),
        };
    }

    // Ya nació: desgaste por tiempo.
    const lastTickAt = state?.lastTickAt ?? nowIso;
    const elapsedHours = Math.min(hoursBetween(lastTickAt, nowMs), DECAY_CAP_HOURS);

    if (elapsedHours <= 0) {
        const needsHygieneBackfill = !Number.isFinite(state?.petStats?.hygiene);
        return {
            state: { ...state, lastTickAt, petStats },
            hatched: false,
            changed: state?.lastTickAt !== lastTickAt || needsHygieneBackfill,
        };
    }

    const hunger = clamp(petStats.hunger - DECAY_PER_HOUR.hunger * elapsedHours);
    const energy = clamp(petStats.energy - DECAY_PER_HOUR.energy * elapsedHours);
    const hygiene = clamp(petStats.hygiene - DECAY_PER_HOUR.hygiene * elapsedHours);

    // Estar sucio o con hambre amarga a la mascota: la felicidad cae al doble.
    // Es lo que hace que bañarla y darle de comer importen más que subir un
    // número — descuidar dos ejes castiga el tercero.
    const miserable = hygiene < NEED_THRESHOLDS.dirty || hunger < NEED_THRESHOLDS.hungry;
    const happiness = clamp(
        petStats.happiness - DECAY_PER_HOUR.happiness * elapsedHours * (miserable ? 2 : 1),
    );

    return {
        state: {
            ...state,
            petStats: {
                ...petStats,
                hunger: Math.round(hunger * 10) / 10,
                energy: Math.round(energy * 10) / 10,
                hygiene: Math.round(hygiene * 10) / 10,
                happiness: Math.round(happiness * 10) / 10,
            },
            lastTickAt: nowIso,
        },
        hatched: false,
        changed: true,
    };
}

/**
 * Decora el estado con lo que la UI necesita mostrar y no conviene recalcular
 * en el cliente (ahí el reloj puede estar corrido o adelantado a propósito).
 */
export function decoratePetState(state: any, nowMs: number) {
    const egg = isEggStage(state);
    return {
        ...state,
        eggProgress: egg ? Math.round(computeEggProgress(state, nowMs)) : 100,
        isEgg: egg,
        primaryNeed: egg ? null : primaryNeed(state?.petStats),
    };
}
