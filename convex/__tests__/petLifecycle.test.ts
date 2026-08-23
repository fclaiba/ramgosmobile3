import {
    computeEggProgress,
    DECAY_CAP_HOURS,
    decoratePetState,
    EGG_INCUBATION_HOURS,
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
    eggStartedAt: iso(T0),
    eggCareBoost: 0,
    lastTickAt: null,
    ...overrides,
});

const hatchedState = (overrides: any = {}) => ({
    gameCoins: 100,
    petStats: { happiness: 80, hunger: 60, energy: 70, hygiene: 80, level: 3, exp: 0 },
    eggStartedAt: iso(T0),
    eggCareBoost: 0,
    lastTickAt: iso(T0),
    ...overrides,
});

describe('incubación del huevo', () => {
    it('progresa con el tiempo transcurrido', () => {
        expect(computeEggProgress(eggState(), T0)).toBe(0);
        expect(computeEggProgress(eggState(), T0 + 24 * HOUR)).toBe(50);
        expect(computeEggProgress(eggState(), T0 + EGG_INCUBATION_HOURS * HOUR)).toBe(100);
    });

    it('los cuidados aceleran el progreso', () => {
        const cuidado = eggState({ eggCareBoost: 20 });
        expect(computeEggProgress(cuidado, T0 + 24 * HOUR)).toBe(70);
    });

    it('nunca pasa de 100', () => {
        const state = eggState({ eggCareBoost: 90 });
        expect(computeEggProgress(state, T0 + 40 * HOUR)).toBe(100);
    });

    it('NO eclosiona por juntar monedas — sólo por tiempo', () => {
        // Regresión: el estado por defecto arranca con 100 monedas y el código
        // viejo rompía el huevo con la primera moneda ganada.
        const rico = eggState({ gameCoins: 5000 });
        const settled = settlePetState(rico, T0 + HOUR);
        expect(settled.hatched).toBe(false);
        expect(isEggStage(settled.state)).toBe(true);
    });

    it('eclosiona al completar la incubación, con los stats llenos', () => {
        const settled = settlePetState(eggState(), T0 + EGG_INCUBATION_HOURS * HOUR);
        expect(settled.hatched).toBe(true);
        expect(settled.state.petStats.level).toBe(3);
        expect(settled.state.petStats.hunger).toBe(100);
        expect(settled.state.petStats.hygiene).toBe(100);
        expect(settled.state.lastTickAt).toBe(iso(T0 + EGG_INCUBATION_HOURS * HOUR));
    });

    it('arranca el reloj la primera vez que se liquida un huevo sin fecha', () => {
        const sinFecha = eggState({ eggStartedAt: null });
        const settled = settlePetState(sinFecha, T0);
        expect(settled.state.eggStartedAt).toBe(iso(T0));
        expect(settled.changed).toBe(true);
    });

    it('el huevo no sufre desgaste', () => {
        const settled = settlePetState(eggState(), T0 + 10 * HOUR);
        expect(settled.state.petStats.hunger).toBe(60);
        expect(settled.state.petStats.energy).toBe(70);
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

    it('decora el estado con el progreso del huevo', () => {
        const decorated = decoratePetState(eggState(), T0 + 24 * HOUR);
        expect(decorated.isEgg).toBe(true);
        expect(decorated.eggProgress).toBe(50);
        expect(decorated.primaryNeed).toBe(null);
    });

    it('una mascota nacida reporta 100% de incubación', () => {
        const decorated = decoratePetState(hatchedState(), T0);
        expect(decorated.isEgg).toBe(false);
        expect(decorated.eggProgress).toBe(100);
    });
});
