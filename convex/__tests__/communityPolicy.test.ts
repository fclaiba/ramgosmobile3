/**
 * Tests de las reglas de acceso a comunidades.
 *
 * `convex/social/_communityPolicy.ts` no importa nada de Convex a propósito
 * (mismo criterio que `social/scoring.ts`), así que esto corre con Jest liso.
 *
 * ALCANCE: cubre las DECISIONES — qué política aplica, si una invitación sirve,
 * qué slug se elige, si el cuestionario está completo. NO cubre los efectos de
 * base de datos (que una comunidad secreta no salga en `searchCommunities`, que
 * `memberCount` no se desincronice tras join→leave→rejoin): eso necesita
 * `convex-test`, que no está instalado en el repo.
 */
import {
    firstMissingRequired,
    INVITE_CODE_ERRORS,
    inviteErrorMessage,
    inviteState,
    isDiscoverable,
    MAX_INVITE_CODE,
    normalizeInviteCode,
    RESERVED_INVITE_CODES,
    resolveJoinPolicy,
    RESERVED_SLUGS,
    slugCandidates,
    slugify,
    validateInviteCode,
} from '../social/_communityPolicy';

const NOW = '2026-08-24T12:00:00.000Z';
const BEFORE = '2026-08-24T11:00:00.000Z';
const AFTER = '2026-08-24T13:00:00.000Z';

describe('resolveJoinPolicy', () => {
    it('respeta la política explícita por encima de la visibilidad', () => {
        expect(resolveJoinPolicy({ visibility: 'public', joinPolicy: 'questionnaire' })).toBe('questionnaire');
        expect(resolveJoinPolicy({ visibility: 'secret', joinPolicy: 'open' })).toBe('open');
    });

    it('deriva de la visibilidad las filas anteriores a la feature', () => {
        // Sin `joinPolicy` (comunidades que ya existían): tiene que comportarse
        // igual que antes — pública entra directo, privada pide aprobación.
        expect(resolveJoinPolicy({ visibility: 'public' })).toBe('open');
        expect(resolveJoinPolicy({ visibility: 'private' })).toBe('approval');
    });

    it('una secreta sin política es SIEMPRE sólo por invitación', () => {
        // Si cayera en 'approval', adivinar el id permitiría pedir entrar, y
        // eso ya confirmaría que la comunidad existe.
        expect(resolveJoinPolicy({ visibility: 'secret' })).toBe('invite');
    });

    it('sin datos cae al lado seguro', () => {
        expect(resolveJoinPolicy({})).toBe('approval');
        expect(resolveJoinPolicy({ joinPolicy: null, visibility: null })).toBe('approval');
    });
});

describe('isDiscoverable', () => {
    it('las secretas nunca aparecen', () => {
        expect(isDiscoverable({ visibility: 'secret' })).toBe(false);
    });

    it('las privadas SÍ aparecen: es lo que las separa de las secretas', () => {
        expect(isDiscoverable({ visibility: 'private' })).toBe(true);
        expect(isDiscoverable({ visibility: 'public' })).toBe(true);
    });

    it('una comunidad borrada no aparece aunque sea pública', () => {
        expect(isDiscoverable({ visibility: 'public', deletedAt: NOW })).toBe(false);
    });
});

describe('inviteState', () => {
    it('una invitación limpia es válida', () => {
        expect(inviteState({ useCount: 0 }, NOW)).toBe('valid');
    });

    it('sin invitación es notfound', () => {
        expect(inviteState(null, NOW)).toBe('notfound');
        expect(inviteState(undefined, NOW)).toBe('notfound');
    });

    it('revocada gana sobre vencida: es la razón que el admin necesita ver', () => {
        expect(inviteState({ revokedAt: BEFORE, expiresAt: BEFORE, useCount: 0 }, NOW)).toBe('revoked');
    });

    it('vence en el instante exacto, no un segundo después', () => {
        expect(inviteState({ expiresAt: NOW, useCount: 0 }, NOW)).toBe('expired');
        expect(inviteState({ expiresAt: AFTER, useCount: 0 }, NOW)).toBe('valid');
        expect(inviteState({ expiresAt: BEFORE, useCount: 0 }, NOW)).toBe('expired');
    });

    it('se agota al alcanzar maxUses, no al superarlo', () => {
        expect(inviteState({ maxUses: 3, useCount: 2 }, NOW)).toBe('valid');
        expect(inviteState({ maxUses: 3, useCount: 3 }, NOW)).toBe('exhausted');
        expect(inviteState({ maxUses: 3, useCount: 9 }, NOW)).toBe('exhausted');
    });

    it('un link de un solo uso se agota con el primer canje', () => {
        expect(inviteState({ maxUses: 1, useCount: 0 }, NOW)).toBe('valid');
        expect(inviteState({ maxUses: 1, useCount: 1 }, NOW)).toBe('exhausted');
    });

    it('sin maxUses los usos son ilimitados', () => {
        expect(inviteState({ useCount: 9999 }, NOW)).toBe('valid');
        expect(inviteState({ maxUses: null, useCount: 9999 }, NOW)).toBe('valid');
    });

    it('maxUses: 0 no es "ilimitado" por accidente', () => {
        // El bug clásico del `!invite.maxUses`: un cero se leería como ausente.
        expect(inviteState({ maxUses: 0, useCount: 0 }, NOW)).toBe('exhausted');
    });

    it('cada estado tiene un mensaje propio', () => {
        const messages = (['expired', 'revoked', 'exhausted', 'notfound'] as const).map(inviteErrorMessage);
        expect(new Set(messages).size).toBe(4);
        messages.forEach((m) => expect(m.length).toBeGreaterThan(0));
    });
});

describe('slugify', () => {
    it('saca acentos y pasa a guiones', () => {
        expect(slugify('Diseño Gráfico')).toBe('diseno-grafico');
        expect(slugify('  Running   Club  ')).toBe('running-club');
    });

    it('no deja guiones colgando en los extremos', () => {
        expect(slugify('!!!Hola!!!')).toBe('hola');
        expect(slugify('---a---')).toBe('a');
    });

    it('corta a 40 caracteres', () => {
        expect(slugify('a'.repeat(80)).length).toBe(40);
    });

    it('un nombre sin caracteres utilizables da vacío', () => {
        expect(slugify('🔥🔥🔥')).toBe('');
        expect(slugify('')).toBe('');
    });
});

describe('slugCandidates', () => {
    it('ofrece el base primero y después sufijos', () => {
        expect(slugCandidates('running', 3)).toEqual(['running', 'running-2', 'running-3']);
    });

    it('nunca propone una ruta reservada de App.tsx', () => {
        for (const reserved of RESERVED_SLUGS) {
            expect(slugCandidates(reserved, 3)).not.toContain(reserved);
        }
    });

    it('tras saltear la reservada sigue ofreciendo alternativas', () => {
        const out = slugCandidates('login', 3);
        expect(out).not.toContain('login');
        expect(out).toContain('login-2');
    });

    it('un base vacío no produce candidatos', () => {
        expect(slugCandidates('', 5)).toEqual([]);
    });
});

describe('códigos de invitación personalizados', () => {
    it('normaliza a minúsculas y guiones', () => {
        expect(normalizeInviteCode('  Verano 2026 ')).toBe('verano-2026');
        expect(normalizeInviteCode('Fiesta!!!Cumple')).toBe('fiesta-cumple');
    });

    it('colapsa guiones repetidos y recorta los extremos', () => {
        expect(normalizeInviteCode('---a---b---')).toBe('a-b');
    });

    it('acepta un código razonable', () => {
        expect(validateInviteCode('verano2026')).toBeNull();
        expect(validateInviteCode('rrpp-ny')).toBeNull();
    });

    it('rechaza demasiado corto y demasiado largo', () => {
        expect(validateInviteCode('ab')).toBe('too-short');
        expect(validateInviteCode('a'.repeat(MAX_INVITE_CODE + 1))).toBe('too-long');
    });

    it('rechaza caracteres que habría que escapar en una URL', () => {
        expect(validateInviteCode('hola mundo')).toBe('invalid-chars');
        expect(validateInviteCode('año2026')).toBe('invalid-chars');
        expect(validateInviteCode('a/b')).toBe('invalid-chars');
    });

    it('rechaza los que chocan con rutas del parser', () => {
        // `/i/c` o `/i/ref` no romperían hoy, pero reservar es más barato que
        // migrar códigos ya repartidos.
        for (const reserved of RESERVED_INVITE_CODES) {
            expect(validateInviteCode(reserved)).toBe('reserved');
        }
    });

    it('cada error tiene su mensaje', () => {
        const keys = ['too-short', 'too-long', 'invalid-chars', 'reserved'] as const;
        const messages = keys.map((k) => INVITE_CODE_ERRORS[k]);
        expect(new Set(messages).size).toBe(4);
    });

    it('normalizar y validar componen: lo que sale de uno sirve para el otro', () => {
        expect(validateInviteCode(normalizeInviteCode('Verano 2026'))).toBeNull();
    });
});

describe('firstMissingRequired', () => {
    const q = (over: Partial<any> = {}) => ({
        id: over.id ?? 'q1',
        prompt: over.prompt ?? '¿Por qué querés entrar?',
        kind: over.kind ?? 'text',
        required: over.required ?? true,
    });

    it('null cuando está todo respondido', () => {
        expect(firstMissingRequired([q()], [{ questionId: 'q1', value: 'porque sí' }])).toBeNull();
    });

    it('ignora las opcionales sin responder', () => {
        expect(firstMissingRequired([q({ required: false })], [])).toBeNull();
    });

    it('devuelve la pregunta, no un booleano, para poder nombrarla', () => {
        const missing = firstMissingRequired([q({ prompt: 'Tu ciudad' })], []);
        expect(missing?.prompt).toBe('Tu ciudad');
    });

    it('un texto en blanco no cuenta como respuesta', () => {
        expect(firstMissingRequired([q()], [{ questionId: 'q1', value: '   ' }])).not.toBeNull();
    });

    it('multi exige al menos una opción elegida', () => {
        const multi = q({ kind: 'multi' });
        expect(firstMissingRequired([multi], [{ questionId: 'q1', optionIds: [] }])).not.toBeNull();
        expect(firstMissingRequired([multi], [{ questionId: 'q1', optionIds: ['a'] }])).toBeNull();
    });

    it('single acepta la respuesta por optionIds', () => {
        const single = q({ kind: 'single' });
        expect(firstMissingRequired([single], [{ questionId: 'q1', optionIds: ['a'] }])).toBeNull();
    });

    it('devuelve la PRIMERA que falta, en orden', () => {
        const questions = [q({ id: 'a', prompt: 'A' }), q({ id: 'b', prompt: 'B' })];
        expect(firstMissingRequired(questions, [])?.prompt).toBe('A');
        expect(firstMissingRequired(questions, [{ questionId: 'a', value: 'ok' }])?.prompt).toBe('B');
    });

    it('una respuesta a una pregunta que ya no existe no tapa la que falta', () => {
        const missing = firstMissingRequired([q({ id: 'nueva' })], [{ questionId: 'vieja', value: 'x' }]);
        expect(missing?.id).toBe('nueva');
    });
});
