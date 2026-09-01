import {
    computeEggProgress,
    DECAY_CAP_HOURS,
    decoratePetState,
    hatchEgg,
    isEggStage,
    primaryNeed,
    settlePetState,
} from '../economy/petLifecycle';

const HOUR = 3_600_000;
const T0 = new Date('2026-01-01T00:00:00.000Z').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const eggState = (overrides: any = {}) => ({
    gameCoins: 100,
    petStats: { happiness: 80, hunger: 60, energy: 70, hygiene: 80, level: 1, exp: 0 },
    eggCoinsEarned: 0,
    eggCareBoost: 0,
    lastTickAt: null,
    ...overrides,
});

const hatchedState = (overrides: any = {}) => ({
    gameCoins: 100,
    petStats: { happiness: 80, hunger: 60, energy: 70, hygiene: 80, level: 3, exp: 0 },
    eggCoinsEarned: 0,
    eggCareBoost: 0,
    lastTickAt: iso(T0),
    ...overrides,
});

describe('incubación del huevo', () => {
    it('progresa con los puntos de juego ganados siendo huevo', () => {
        expect(computeEggProgress(eggState())).toBe(0);
        expect(computeEggProgress(eggState({ eggCoinsEarned: 50 }))).toBe(50);
        expect(computeEggProgress(eggState({ eggCoinsEarned: 100 }))).toBe(100);
    });

    it('los cuidados suman aparte de los puntos de juego', () => {
        const cuidado = eggState({ eggCoinsEarned: 50, eggCareBoost: 20 });
        expect(computeEggProgress(cuidado)).toBe(70);
    });

    it('nunca pasa de 100', () => {
        const state = eggState({ eggCoinsEarned: 90, eggCareBoost: 90 });
        expect(computeEggProgress(state)).toBe(100);
    });

    it('llegar a 100 no eclosiona sola — sólo queda "lista"', () => {
        // Regresión: el estado por defecto arranca con 100 monedas de saldo;
        // eso NO debe eclosionar nada, sólo `eggCoinsEarned` cuenta.
        const rico = eggState({ gameCoins: 5000, eggCoinsEarned: 0 });
        const settled = settlePetState(rico, T0 + HOUR);
        expect(settled.hatched).toBe(false);
        expect(isEggStage(settled.state)).toBe(true);

        const lista = eggState({ eggCoinsEarned: 100 });
        const settledLista = settlePetState(lista, T0 + HOUR);
        expect(settledLista.hatched).toBe(false);
        expect(isEggStage(settledLista.state)).toBe(true);
    });

    it('el huevo no sufre desgaste', () => {
        const settled = settlePetState(eggState(), T0 + 10 * HOUR);
        expect(settled.state.petStats.hunger).toBe(60);
        expect(settled.state.petStats.energy).toBe(70);
    });
});

describe('abrir el huevo (hatchEgg)', () => {
    it('rechaza abrir si todavía no llegó a 100', () => {
        const result = hatchEgg(eggState({ eggCoinsEarned: 99 }), T0);
        expect(result.hatched).toBe(false);
        expect(isEggStage(result.state)).toBe(true);
    });

    it('eclosiona al tocar el botón con 100 de progreso, con los stats llenos', () => {
        const result = hatchEgg(eggState({ eggCoinsEarned: 100 }), T0);
        expect(result.hatched).toBe(true);
        expect(result.state.petStats.level).toBe(3);
        expect(result.state.petStats.hunger).toBe(100);
        expect(result.state.petStats.hygiene).toBe(100);
        expect(result.state.lastTickAt).toBe(iso(T0));
    });

    it('no hace nada si ya nació', () => {
        const nacida = hatchedState();
        const result = hatchEgg(nacida, T0);
        expect(result.hatched).toBe(false);
        expect(result.state).toBe(nacida);
    });
});

describe('desgaste de la mascota', () => {
    it('baja los stats según las horas transcurridas', () => {
        const settled = settlePetState(hatchedState(), T0 + 10 * HOUR);
        expect(settled.state.petStats.hunger).toBe(40); // 60 - 2*10
        expect(settled.state.petStats.energy).toBe(55); // 70 - 1.5*10
        expect(settled.state.petStats.hygiene).toBe(68); // 80 - 1.2*10
        expect(settled.state.petStats.happiness).toBe(70); // 80 - 1*10
    });

    it('la felicidad cae al doble si está sucia o con hambre', () => {
        const sucia = hatchedState({
            petStats: { happiness: 80, hunger: 100, energy: 70, hygiene: 10, level: 3, exp: 0 },
        });
        const settled = settlePetState(sucia, T0 + 10 * HOUR);
        expect(settled.state.petStats.happiness).toBe(60); // 80 - 1*10*2
    });

    it('nunca baja de 0', () => {
        const settled = settlePetState(hatchedState(), T0 + 1000 * HOUR);
        expect(settled.state.petStats.hunger).toBe(0);
        expect(settled.state.petStats.happiness).toBe(0);
    });

    it('acota el abandono largo al tope de horas', () => {
        const unMes = settlePetState(hatchedState(), T0 + 720 * HOUR);
        const tresDias = settlePetState(hatchedState(), T0 + DECAY_CAP_HOURS * HOUR);
        expect(unMes.state.petStats).toEqual(tresDias.state.petStats);
    });

    it('es idempotente dentro del mismo instante', () => {
        const primera = settlePetState(hatchedState(), T0 + 5 * HOUR);
        const segunda = settlePetState(primera.state, T0 + 5 * HOUR);
        expect(segunda.state.petStats).toEqual(primera.state.petStats);
        expect(segunda.changed).toBe(false);
    });

    it('rellena higiene en estados guardados antes de que el stat existiera', () => {
        const legacy = hatchedState({
            petStats: { happiness: 80, hunger: 60, energy: 70, level: 3, exp: 0 },
        });
        const settled = settlePetState(legacy, T0);
        expect(settled.state.petStats.hygiene).toBe(80);
        expect(settled.changed).toBe(true);
    });
});

describe('necesidades visibles', () => {
    it('prioriza hambre sobre higiene y sueño', () => {
        expect(primaryNeed({ hunger: 10, hygiene: 10, energy: 10 })).toBe('hungry');
        expect(primaryNeed({ hunger: 90, hygiene: 10, energy: 10 })).toBe('dirty');
        expect(primaryNeed({ hunger: 90, hygiene: 90, energy: 10 })).toBe('sleepy');
        expect(primaryNeed({ hunger: 90, hygiene: 90, energy: 90 })).toBe(null);
    });

    it('decora el estado con el progreso del huevo y si está listo', () => {
        const decorated = decoratePetState(eggState({ eggCoinsEarned: 50 }), T0);
        expect(decorated.isEgg).toBe(true);
        expect(decorated.eggProgress).toBe(50);
        expect(decorated.eggReady).toBe(false);
        expect(decorated.primaryNeed).toBe(null);
    });

    it('marca el huevo como listo (eggReady) al llegar a 100, sin eclosionar', () => {
        const decorated = decoratePetState(eggState({ eggCoinsEarned: 100 }), T0);
        expect(decorated.isEgg).toBe(true);
        expect(decorated.eggProgress).toBe(100);
        expect(decorated.eggReady).toBe(true);
    });

    it('una mascota nacida reporta 100% de incubación y no está "lista" (ya nació)', () => {
        const decorated = decoratePetState(hatchedState(), T0);
        expect(decorated.isEgg).toBe(false);
        expect(decorated.eggProgress).toBe(100);
        expect(decorated.eggReady).toBe(false);
    });
});
