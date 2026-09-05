/**
 * Aritmética de la agenda (H5, E-149 AGD).
 *
 * El bug que motivó este módulo: los horarios se generaban en el cliente y el
 * servidor guardaba cualquier string. Estos tests fijan la grilla del servidor
 * — incluidos los dos días del año donde la aritmética ingenua se rompe.
 */
import {
    canCancelFreely,
    findSlot,
    formatHhMm,
    generateSlots,
    instantToWallClock,
    isConfigUsable,
    isValidTimezone,
    offsetMinutesFor,
    parseDate,
    parseHhMm,
    wallClockToInstant,
    weekdayOf,
    type BusinessAgendaConfig,
} from '../_agenda';

const NY = 'America/New_York';

const config = (over: Partial<BusinessAgendaConfig> = {}): BusinessAgendaConfig => ({
    startHour: '09:00',
    endHour: '18:00',
    slotDurationMinutes: 60,
    workingDays: [1, 2, 3, 4, 5], // lunes a viernes
    timezone: NY,
    ...over,
});

describe('parseo', () => {
    it('lee y escribe HH:mm', () => {
        expect(parseHhMm('09:30')).toBe(570);
        expect(formatHhMm(570)).toBe('09:30');
        expect(formatHhMm(0)).toBe('00:00');
    });

    it('rechaza horas imposibles', () => {
        expect(parseHhMm('25:00')).toBeNull();
        expect(parseHhMm('09:60')).toBeNull();
        expect(parseHhMm('nueve')).toBeNull();
    });

    it('rechaza fechas que no existen', () => {
        expect(parseDate('2026-02-31')).toBeNull();
        expect(parseDate('2026-13-01')).toBeNull();
        expect(parseDate('2026-03-08')).toEqual([2026, 3, 8]);
    });

    it('el día de la semana no depende del dispositivo', () => {
        // Era el bug de FormFillScreen: usaba getDay() sobre la fecha local y
        // toISOString() para el string, que pueden ser días distintos.
        expect(weekdayOf('2026-03-08')).toBe(0); // domingo
        expect(weekdayOf('2026-03-09')).toBe(1); // lunes
    });
});

describe('zonas horarias', () => {
    it('reconoce una zona IANA y rechaza basura', () => {
        expect(isValidTimezone(NY)).toBe(true);
        expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    });

    it('calcula el offset con DST aplicado', () => {
        // Enero: EST = UTC−5. Julio: EDT = UTC−4.
        expect(offsetMinutesFor(NY, Date.UTC(2026, 0, 15, 12))).toBe(-300);
        expect(offsetMinutesFor(NY, Date.UTC(2026, 6, 15, 12))).toBe(-240);
    });

    it('ida y vuelta entre reloj de pared e instante', () => {
        const ms = wallClockToInstant('2026-01-15', '09:00', NY);
        expect(ms).not.toBeNull();
        expect(instantToWallClock(ms!, NY)).toEqual({ date: '2026-01-15', time: '09:00' });
        // 9 AM EST = 14:00 UTC
        expect(new Date(ms!).toISOString()).toBe('2026-01-15T14:00:00.000Z');
    });

    it('el mismo reloj de pared da instantes distintos en invierno y verano', () => {
        const enero = wallClockToInstant('2026-01-15', '09:00', NY)!;
        const julio = wallClockToInstant('2026-07-15', '09:00', NY)!;
        expect(new Date(enero).getUTCHours()).toBe(14); // EST
        expect(new Date(julio).getUTCHours()).toBe(13); // EDT
    });
});

describe('cambio de hora', () => {
    // En NY 2026 adelantan el 8 de marzo: a las 2:00 saltan a las 3:00.
    it('una hora que no existe devuelve null', () => {
        expect(wallClockToInstant('2026-03-08', '02:30', NY)).toBeNull();
    });

    it('las horas vecinas al salto sí existen', () => {
        expect(wallClockToInstant('2026-03-08', '01:30', NY)).not.toBeNull();
        expect(wallClockToInstant('2026-03-08', '03:30', NY)).not.toBeNull();
    });

    it('la grilla saltea la hora inexistente en vez de agendar en la nada', () => {
        // Negocio que abre de 00:00 a 06:00 el domingo del salto.
        const slots = generateSlots(
            config({ startHour: '00:00', endHour: '06:00', slotDurationMinutes: 60, workingDays: [0] }),
            '2026-03-08',
        );
        expect(slots.map((s) => s.slotTime)).not.toContain('02:00');
        // Y ninguno de los que quedan es un instante inválido.
        expect(slots.every((s) => Number.isFinite(s.startsAtMs))).toBe(true);
    });

    it('el día que atrasan la hora, la hora repetida resuelve determinista', () => {
        // 1 de noviembre de 2026: las 1:30 AM ocurren dos veces.
        const a = wallClockToInstant('2026-11-01', '01:30', NY);
        const b = wallClockToInstant('2026-11-01', '01:30', NY);
        expect(a).not.toBeNull();
        expect(a).toBe(b);
        expect(instantToWallClock(a!, NY).time).toBe('01:30');
    });
});

describe('generateSlots', () => {
    it('arma la grilla del día laboral', () => {
        const slots = generateSlots(config(), '2026-01-15'); // jueves
        expect(slots.map((s) => s.slotTime)).toEqual([
            '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
        ]);
    });

    it('un día no laboral no tiene turnos', () => {
        expect(generateSlots(config(), '2026-01-17')).toEqual([]); // sábado
    });

    it('el último turno TERMINA dentro del horario', () => {
        // La grilla del cliente usaba `while (start < end)`: con turnos de 90'
        // y cierre a las 18:00 metía uno a las 17:30 que terminaba 18:30.
        const slots = generateSlots(config({ slotDurationMinutes: 90 }), '2026-01-15');
        const last = slots[slots.length - 1];
        expect(last.slotTime).toBe('16:30');
        expect(instantToWallClock(last.endsAtMs, NY).time).toBe('18:00');
    });

    it('endsAtMs es exactamente la duración después del inicio', () => {
        const [first] = generateSlots(config({ slotDurationMinutes: 45 }), '2026-01-15');
        expect(first.endsAtMs - first.startsAtMs).toBe(45 * 60_000);
    });

    it('con `nowMs` descarta los turnos que ya pasaron', () => {
        const mediodia = wallClockToInstant('2026-01-15', '12:00', NY)!;
        const slots = generateSlots(config(), '2026-01-15', mediodia);
        expect(slots.map((s) => s.slotTime)).toEqual(['13:00', '14:00', '15:00', '16:00', '17:00']);
    });

    it('una config inutilizable no genera nada en vez de romper', () => {
        expect(generateSlots(config({ endHour: '08:00' }), '2026-01-15')).toEqual([]); // cierra antes de abrir
        expect(generateSlots(config({ workingDays: [] }), '2026-01-15')).toEqual([]);
        expect(generateSlots(config({ slotDurationMinutes: 0 }), '2026-01-15')).toEqual([]);
        expect(isConfigUsable(config({ timezone: 'nope' }))).toBe(false);
    });
});

describe('findSlot — la validación que el servidor no tenía', () => {
    it('acepta un horario de la grilla', () => {
        expect(findSlot(config(), '2026-01-15', '10:00')).not.toBeNull();
    });

    it('rechaza un horario fuera del horario de atención', () => {
        expect(findSlot(config(), '2026-01-15', '03:00')).toBeNull();
    });

    it('rechaza un horario que no cae en la grilla', () => {
        expect(findSlot(config(), '2026-01-15', '10:17')).toBeNull();
    });

    it('rechaza un día no laboral', () => {
        expect(findSlot(config(), '2026-01-18', '10:00')).toBeNull(); // domingo
    });

    it('rechaza un turno en el pasado', () => {
        const tarde = wallClockToInstant('2026-01-15', '16:00', NY)!;
        expect(findSlot(config(), '2026-01-15', '10:00', tarde)).toBeNull();
    });
});

describe('canCancelFreely — ventana de 24 h', () => {
    const inicio = Date.UTC(2026, 0, 15, 14);

    it('con más de 24 h de anticipación, sí', () => {
        expect(canCancelFreely(inicio, inicio - 25 * 3600_000)).toBe(true);
    });

    it('justo en 24 h, sí (el borde es inclusivo)', () => {
        expect(canCancelFreely(inicio, inicio - 24 * 3600_000)).toBe(true);
    });

    it('dentro de las 24 h, no', () => {
        expect(canCancelFreely(inicio, inicio - 23 * 3600_000)).toBe(false);
    });

    it('con el turno ya empezado, no', () => {
        expect(canCancelFreely(inicio, inicio + 3600_000)).toBe(false);
    });

    it('respeta una ventana configurada distinta', () => {
        expect(canCancelFreely(inicio, inicio - 30 * 3600_000, 48)).toBe(false);
        expect(canCancelFreely(inicio, inicio - 49 * 3600_000, 48)).toBe(true);
    });
});
