/**
 * Ciclo de vida de la mascota: incubación del huevo y desgaste por el tiempo.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Antes había tres modelos contradictorios:
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
 * El desgaste post-nacimiento sigue derivándose de timestamps en el servidor
 * (sin cron): el estado guarda *cuándo* pasó la última liquidación y se
 * calcula qué debería haber pasado desde entonces.
 *
 * La incubación del huevo, en cambio, NO depende del reloj: depende de
 * `eggCoinsEarned`, un contador aparte del saldo gastable de monedas
 * (`gameCoins`) que sólo sube cuando el usuario gana monedas jugando a los
 * minijuegos arcade mientras la mascota sigue siendo huevo. Es un contador
 * distinto del saldo a propósito — leer el saldo directamente reintroduciría
 * el bug #1 de arriba, porque el saldo arranca en 100 y se gasta y se
 * recarga constantemente. Al llegar a 100 el huevo queda "listo"
 * (`eggReady`), pero no eclosiona solo: hace falta que el usuario toque el
 * botón "Abrir huevo", que llama a `hatchEgg`.
 *
 * Las funciones son puras (estado + `nowMs` → estado nuevo) para poder testear
 * sin tocar la base ni el reloj real.
 */

/** Cuánto progreso suma cada acción de cuidado sobre el huevo (boost secundario). */
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
 * El driver principal son los puntos de juego (`eggCoinsEarned`, monedas
 * arcade ganadas siendo huevo); `eggCareBoost` es un boost secundario que dan
 * "Dar calor" y el login diario. `nowMs` ya no interviene — se mantiene el
 * parámetro para no romper todas las llamadas existentes.
 */
export function computeEggProgress(state: any, _nowMs?: number): number {
    const fromCoins = Number(state?.eggCoinsEarned) || 0;
    const fromCare = Number(state?.eggCareBoost) || 0;
    return clamp(fromCoins + fromCare);
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
 * En etapa huevo no hay nada que liquidar contra el reloj: el progreso lo da
 * `computeEggProgress` directo del estado guardado, y aunque llegue a 100 acá
 * NO eclosiona sola — eso es responsabilidad exclusiva de `hatchEgg`, que se
 * dispara con el botón "Abrir huevo". Después de nacer, aplica el desgaste de
 * las horas transcurridas desde `lastTickAt`.
 */
export function settlePetState(state: any, nowMs: number): SettleResult {
    const nowIso = new Date(nowMs).toISOString();
    const petStats = { ...(state?.petStats || {}) };

    // Higiene es un stat nuevo: los estados viejos no lo tienen.
    if (!Number.isFinite(petStats.hygiene)) petStats.hygiene = 80;

    if (isEggStage(state)) {
        return {
            state: { ...state, petStats },
            hatched: false,
            changed: !Number.isFinite(state?.petStats?.hygiene),
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

export type HatchResult = {
    state: any;
    hatched: boolean;
};

/**
 * Abre el huevo: si todavía no juntó 100 de progreso, no hace nada. Si sí,
 * aplica la misma transición que antes disparaba sola `settlePetState` —
 * ahora sólo corre cuando el usuario toca "Abrir huevo".
 */
export function hatchEgg(state: any, nowMs: number): HatchResult {
    if (!isEggStage(state) || computeEggProgress(state) < 100) {
        return { state, hatched: false };
    }

    const petStats = { ...(state?.petStats || {}) };
    return {
        state: {
            ...state,
            petStats: {
                ...petStats,
                level: HATCHED_LEVEL,
                exp: 0,
                happiness: 100,
                hunger: 100,
                energy: 100,
                hygiene: 100,
            },
            lastTickAt: new Date(nowMs).toISOString(),
        },
        hatched: true,
    };
}

/**
 * Decora el estado con lo que la UI necesita mostrar y no conviene recalcular
 * en el cliente (ahí el reloj puede estar corrido o adelantado a propósito).
 */
export function decoratePetState(state: any, nowMs: number) {
    const egg = isEggStage(state);
    const progress = egg ? Math.round(computeEggProgress(state)) : 100;
    return {
        ...state,
        eggProgress: progress,
        eggReady: egg && progress >= 100,
        isEgg: egg,
        primaryNeed: egg ? null : primaryNeed(state?.petStats),
    };
}
