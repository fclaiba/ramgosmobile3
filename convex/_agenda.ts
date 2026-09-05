/**
 * Agenda de turnos — aritmética de horarios. Módulo puro.
 *
 * POR QUÉ EXISTE (H5, E-149 invariantes AGD)
 *
 * Los horarios disponibles se calculaban EN EL CLIENTE
 * (`src/screens/FormFillScreen.tsx:92-105`) y el servidor guardaba lo que le
 * mandaran: `businessForms.submitLead` aceptaba `scheduledDate`/`scheduledTime`
 * como strings libres, sin mirar `businessSettings` ni chequear si el horario
 * ya estaba tomado. Dos compradores elegían el mismo turno y los dos quedaban
 * agendados; un cliente modificado agendaba a las 3 AM de un domingo, o en una
 * fecha pasada.
 *
 * Es la misma causa raíz que STK-01 (cerrado en H3): el chequeo vivía donde no
 * podía escribir. Acá está la grilla, y `convex/agenda.ts` la aplica dentro de
 * una sola mutation.
 *
 * TIMEZONE
 *
 * El repo no tenía NADA de zonas horarias (0 hits de `timeZone` en `convex/` y
 * `src/`) y no hay librería de fechas instalada. `FormFillScreen.tsx:95` hacía
 * `new Date(\`${fecha}T${hora}:00\`)`, que parsea en la zona DEL DISPOSITIVO:
 * un comprador en otra zona veía horarios distintos de los que el negocio
 * ofrecía. Acá la zona del NEGOCIO es la única que manda, y la conversión sale
 * de `Intl` (única forma de respetar DST sin agregar una dependencia).
 *
 * Módulo puro: recibe datos, no `ctx`. El prefijo `_` lo mantiene fuera del
 * registro de funciones de Convex.
 */

/** Zona por defecto: el proyecto ya factura como `US-NY` (ver `stripe.ts`). */
export const DEFAULT_TIMEZONE = "America/New_York";

/** Ventana de cancelación sin costo, en horas. Decisión de producto. */
export const DEFAULT_CANCELLATION_HOURS = 24;

export type BusinessAgendaConfig = {
    /** "HH:mm" en hora local del negocio. */
    startHour: string;
    endHour: string;
    slotDurationMinutes: number;
    /** Convención de `Date.getDay()`: 0 = domingo … 6 = sábado. */
    workingDays: number[];
    /** IANA, p. ej. "America/New_York". */
    timezone: string;
};

export type Slot = {
    /** "HH:mm" en hora local del negocio. */
    slotTime: string;
    startsAtMs: number;
    endsAtMs: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// Crear un `Intl.DateTimeFormat` es caro y acá se llama en bucle (una vez por
// slot de la grilla), así que se cachean por zona.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
    let dtf = formatterCache.get(timezone);
    if (!dtf) {
        dtf = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            // `hourCycle: h23` y no `hour12: false`: este último devuelve "24"
            // para la medianoche en varios runtimes.
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        formatterCache.set(timezone, dtf);
    }
    return dtf;
}

/** ¿`Intl` reconoce esta zona? Se valida al GUARDAR la config, no al usarla. */
export function isValidTimezone(timezone: string): boolean {
    try {
        formatterFor(timezone).format(0);
        return true;
    } catch {
        return false;
    }
}

/** "HH:mm" → minutos desde medianoche. `null` si no tiene esa forma. */
export function parseHhMm(value: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
}

/** minutos desde medianoche → "HH:mm". */
export function formatHhMm(minutesFromMidnight: number): string {
    const total = ((Math.round(minutesFromMidnight) % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → [año, mes(1-12), día]. `null` si no tiene esa forma. */
export function parseDate(value: string): [number, number, number] | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    // Rechaza fechas que no existen (31 de febrero y compañía).
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
        return null;
    }
    return [y, mo, d];
}

/**
 * Día de la semana de una fecha de calendario (0 = domingo).
 *
 * No depende de la zona: "2026-03-08" cae domingo en todas partes. Por eso se
 * calcula en UTC y no con la fecha del dispositivo, que era el bug de
 * `FormFillScreen.tsx:76`.
 */
export function weekdayOf(dateStr: string): number | null {
    const parsed = parseDate(dateStr);
    if (!parsed) return null;
    const [y, mo, d] = parsed;
    return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/**
 * Offset de la zona en ese instante, en minutos (positivo al este de UTC).
 *
 * Formatea el instante en la zona y vuelve a leer las partes como si fueran
 * UTC: la diferencia con el instante original ES el offset, ya con DST
 * aplicado.
 */
export function offsetMinutesFor(timezone: string, instantMs: number): number {
    const parts = formatterFor(timezone).formatToParts(new Date(instantMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asIfUtc = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    );
    return Math.round((asIfUtc - instantMs) / MINUTE_MS);
}

/** Instante → reloj de pared del negocio. */
export function instantToWallClock(
    instantMs: number,
    timezone: string,
): { date: string; time: string } {
    const parts = formatterFor(timezone).formatToParts(new Date(instantMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return {
        date: `${get("year")}-${get("month")}-${get("day")}`,
        time: `${get("hour")}:${get("minute")}`,
    };
}

/**
 * Reloj de pared del negocio → instante UTC.
 *
 * Devuelve `null` cuando esa hora NO EXISTE en esa zona: el día que adelantan
 * la hora, las 2:30 AM no ocurren nunca, y agendar un turno ahí sería agendar
 * en la nada. En el caso inverso (el día que atrasan, las 1:30 AM ocurren dos
 * veces) se resuelve a la primera de las dos, de forma determinista.
 */
export function wallClockToInstant(
    dateStr: string,
    timeStr: string,
    timezone: string,
): number | null {
    const parsedDate = parseDate(dateStr);
    const minutes = parseHhMm(timeStr);
    if (!parsedDate || minutes === null) return null;
    const [y, mo, d] = parsedDate;

    // Si el reloj de pared fuera UTC, el instante sería éste. El offset real se
    // le resta; hacen falta dos pasadas porque el offset depende del instante
    // (y el instante, del offset) — la segunda converge en todos los saltos de
    // DST del mundo real, que son de una hora.
    const asIfUtc = Date.UTC(y, mo - 1, d) + minutes * MINUTE_MS;
    let instant = asIfUtc - offsetMinutesFor(timezone, asIfUtc) * MINUTE_MS;
    instant = asIfUtc - offsetMinutesFor(timezone, instant) * MINUTE_MS;

    // Verificación: si al volver a formatear no da la hora pedida, esa hora no
    // existe en esa zona.
    const back = instantToWallClock(instant, timezone);
    if (back.date !== dateStr || back.time !== formatHhMm(minutes)) return null;
    return instant;
}

/** La config es utilizable? (horarios con forma válida y fin después del inicio) */
export function isConfigUsable(config: BusinessAgendaConfig): boolean {
    const start = parseHhMm(config.startHour);
    const end = parseHhMm(config.endHour);
    return (
        start !== null &&
        end !== null &&
        end > start &&
        Number.isFinite(config.slotDurationMinutes) &&
        config.slotDurationMinutes > 0 &&
        Array.isArray(config.workingDays) &&
        config.workingDays.length > 0 &&
        isValidTimezone(config.timezone)
    );
}

/**
 * La grilla de turnos de un día, en la zona del negocio.
 *
 * Un turno entra sólo si TERMINA dentro del horario: con la grilla del cliente
 * (`while (start < end)`) un turno de 60' a las 17:30 entraba aunque el negocio
 * cerrara a las 18:00.
 *
 * `nowMs` (opcional) descarta los que ya pasaron.
 */
export function generateSlots(
    config: BusinessAgendaConfig,
    dateStr: string,
    nowMs?: number,
): Slot[] {
    if (!isConfigUsable(config)) return [];
    const weekday = weekdayOf(dateStr);
    if (weekday === null || !config.workingDays.includes(weekday)) return [];

    const start = parseHhMm(config.startHour)!;
    const end = parseHhMm(config.endHour)!;
    const step = Math.floor(config.slotDurationMinutes);

    const slots: Slot[] = [];
    for (let cursor = start; cursor + step <= end; cursor += step) {
        const slotTime = formatHhMm(cursor);
        const startsAtMs = wallClockToInstant(dateStr, slotTime, config.timezone);
        // `null` = esa hora no existe ese día (salto de DST): se saltea.
        if (startsAtMs === null) continue;
        const endsAtMs = startsAtMs + step * MINUTE_MS;
        if (nowMs !== undefined && startsAtMs <= nowMs) continue;
        slots.push({ slotTime, startsAtMs, endsAtMs });
    }
    return slots;
}

/**
 * ¿El turno que pide el cliente es uno de los de la grilla?
 *
 * Se valida contra `generateSlots` a propósito, en vez de repetir las reglas:
 * así no puede haber dos definiciones de "horario válido" que se separen con
 * el tiempo — que es justo lo que pasó entre el cliente y el servidor.
 */
export function findSlot(
    config: BusinessAgendaConfig,
    dateStr: string,
    slotTime: string,
    nowMs?: number,
): Slot | null {
    return generateSlots(config, dateStr, nowMs).find((s) => s.slotTime === slotTime) ?? null;
}

/**
 * ¿Puede el comprador cancelar solo y recuperar la plata?
 *
 * Fuera de la ventana, sí. Dentro, no: el negocio ya no llega a llenar ese
 * hueco. Mismo criterio que un bono `redeemed` (H2) o una entrada `checked_in`
 * (H4) — se puede igual, pero lo tiene que decidir un admin.
 */
export function canCancelFreely(
    startsAtMs: number,
    nowMs: number,
    cancellationHours: number = DEFAULT_CANCELLATION_HOURS,
): boolean {
    const hours = Number.isFinite(cancellationHours) ? Math.max(0, cancellationHours) : DEFAULT_CANCELLATION_HOURS;
    return startsAtMs - nowMs >= hours * HOUR_MS;
}
