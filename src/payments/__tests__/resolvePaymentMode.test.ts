import { resolveEffectiveMode, type PaymentMode } from '../resolvePaymentMode';

const BOTH: PaymentMode[] = ['test', 'live'];

describe('resolveEffectiveMode', () => {
    it('con los dos modos configurados y sin preferencia, gana LIVE', () => {
        // El bug que esto blinda: antes ganaba 'test', así que en producción
        // el cliente pagaba contra la cuenta de prueba y la orden se creaba
        // igual — stock descontado y payout al vendedor sin plata detrás.
        expect(resolveEffectiveMode(null, BOTH)).toBe('live');
        expect(resolveEffectiveMode('none', BOTH)).toBe('live');
    });

    it('respeta la preferencia explícita del dispositivo', () => {
        expect(resolveEffectiveMode('test', BOTH)).toBe('test');
        expect(resolveEffectiveMode('live', BOTH)).toBe('live');
    });

    it('ignora una preferencia por un modo que no está configurado', () => {
        expect(resolveEffectiveMode('test', ['live'])).toBe('live');
        expect(resolveEffectiveMode('live', ['test'])).toBe('test');
    });

    it('con un solo modo disponible, usa ese', () => {
        for (const stored of [null, 'none', 'test', 'live'] as const) {
            expect(resolveEffectiveMode(stored, ['live'])).toBe('live');
            expect(resolveEffectiveMode(stored, ['test'])).toBe('test');
        }
    });

    it('sin ningún modo configurado cae a test, que es lo inocuo', () => {
        // No hay con qué cobrar; el checkout va a fallar antes igual. Elegir
        // 'live' acá sólo haría el mensaje de error más confuso.
        expect(resolveEffectiveMode(null, [])).toBe('test');
        expect(resolveEffectiveMode('live', [])).toBe('test');
    });

    it('nunca devuelve un modo que no esté disponible (salvo que no haya ninguno)', () => {
        const casos: Array<[Parameters<typeof resolveEffectiveMode>[0], PaymentMode[]]> = [
            [null, BOTH], ['none', BOTH], ['test', BOTH], ['live', BOTH],
            [null, ['live']], ['test', ['live']],
            [null, ['test']], ['live', ['test']],
        ];
        for (const [stored, available] of casos) {
            expect(available).toContain(resolveEffectiveMode(stored, available));
        }
    });
});
