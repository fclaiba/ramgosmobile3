import {
    buildCommunityInviteLink,
    buildCommunityLink,
    buildShortInviteLink,
    isCommunityDirectoryLink,
    parseCommunityDeepLink,
    parseShortInviteLink,
} from '../communityDeepLink';

describe('buildCommunityLink', () => {
    it('arma la URL canónica', () => {
        expect(buildCommunityLink('abc123')).toBe('https://ramgos.app/c/abc123');
    });

    it('escapa el slug', () => {
        expect(buildCommunityLink('diseño gráfico')).toBe(
            'https://ramgos.app/c/dise%C3%B1o%20gr%C3%A1fico',
        );
    });

    it('sin id devuelve vacío en vez de una URL rota', () => {
        expect(buildCommunityLink('')).toBe('');
        expect(buildCommunityLink('   ')).toBe('');
    });
});

describe('buildCommunityInviteLink', () => {
    it('cuelga el token de la query', () => {
        expect(buildCommunityInviteLink({ communityIdOrSlug: 'run', token: 'TOK123' })).toBe(
            'https://ramgos.app/c/run?invite=TOK123',
        );
    });

    it('propaga el código de referido junto al token', () => {
        expect(
            buildCommunityInviteLink({ communityIdOrSlug: 'run', token: 'TOK', referralCode: 'FRAN' }),
        ).toBe('https://ramgos.app/c/run?invite=TOK&ref=FRAN');
    });

    it('saca la arroba del referido', () => {
        const url = buildCommunityInviteLink({
            communityIdOrSlug: 'run',
            token: 'TOK',
            referralCode: '@fran',
        });
        expect(url).toContain('ref=fran');
    });

    it('sin token cae al link simple, no a una URL con invite vacío', () => {
        expect(buildCommunityInviteLink({ communityIdOrSlug: 'run', token: '' })).toBe(
            'https://ramgos.app/c/run',
        );
    });
});

describe('parseCommunityDeepLink', () => {
    it('parsea la URL web canónica', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c/abc123')).toEqual({
            communityIdOrSlug: 'abc123',
            inviteToken: undefined,
            referralCode: undefined,
        });
    });

    it('parsea el scheme nativo', () => {
        expect(parseCommunityDeepLink('ramgos://c/abc123')?.communityIdOrSlug).toBe('abc123');
    });

    it('parsea un path suelto, que es lo que recibe getStateFromPath', () => {
        expect(parseCommunityDeepLink('/c/abc123')?.communityIdOrSlug).toBe('abc123');
    });

    it('acepta www y el dominio .com legacy', () => {
        expect(parseCommunityDeepLink('https://www.ramgos.app/c/x')?.communityIdOrSlug).toBe('x');
        expect(parseCommunityDeepLink('https://ramgos.com/c/x')?.communityIdOrSlug).toBe('x');
    });

    it('rechaza hosts ajenos: un link de otro dominio no abre nada', () => {
        expect(parseCommunityDeepLink('https://evil.com/c/abc123')).toBeNull();
        expect(parseCommunityDeepLink('https://ramgos.app.evil.com/c/abc')).toBeNull();
    });

    it('extrae el token de invitación', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c/abc?invite=TOK123')?.inviteToken).toBe(
            'TOK123',
        );
    });

    it('CONSERVA el ?ref= junto al invite (regresión E-089)', () => {
        // Perder el `ref` en esta rama repetiría la pérdida de comisiones de
        // E-089, ahora por el camino de comunidades.
        const parsed = parseCommunityDeepLink('https://ramgos.app/c/abc?invite=TOK&ref=FRAN');
        expect(parsed).toEqual({
            communityIdOrSlug: 'abc',
            inviteToken: 'TOK',
            referralCode: 'FRAN',
        });
    });

    it('conserva el ref aunque venga primero', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c/abc?ref=FRAN&invite=TOK')).toEqual({
            communityIdOrSlug: 'abc',
            inviteToken: 'TOK',
            referralCode: 'FRAN',
        });
    });

    it('ignora el fragmento', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c/abc?invite=TOK#seccion')?.inviteToken).toBe(
            'TOK',
        );
    });

    it('decodifica los valores escapados', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c/dise%C3%B1o')?.communityIdOrSlug).toBe(
            'diseño',
        );
    });

    it('un parámetro vacío queda undefined, no cadena vacía', () => {
        const parsed = parseCommunityDeepLink('https://ramgos.app/c/abc?invite=&ref=');
        expect(parsed?.inviteToken).toBeUndefined();
        expect(parsed?.referralCode).toBeUndefined();
    });

    it('NO se come links de otras secciones', () => {
        // La rama de comunidad se inserta antes de la de handles: si mordiera
        // estas formas, rompería perfiles, productos y bonos.
        expect(parseCommunityDeepLink('https://ramgos.app/ref/CODE?bono=1')).toBeNull();
        expect(parseCommunityDeepLink('https://ramgos.app/tienda/zapatilla')).toBeNull();
        expect(parseCommunityDeepLink('https://ramgos.app/tienda')).toBeNull();
        expect(parseCommunityDeepLink('ramgos://bono/123?ref=CODE')).toBeNull();
    });

    it('/c sin id no es un link de comunidad', () => {
        expect(parseCommunityDeepLink('https://ramgos.app/c')).toBeNull();
        expect(parseCommunityDeepLink('https://ramgos.app/c/')).toBeNull();
    });

    it('tolera basura sin explotar', () => {
        expect(parseCommunityDeepLink(null)).toBeNull();
        expect(parseCommunityDeepLink(undefined)).toBeNull();
        expect(parseCommunityDeepLink('')).toBeNull();
        expect(parseCommunityDeepLink('no es una url')).toBeNull();
        expect(parseCommunityDeepLink('%%%')).toBeNull();
    });

    it('ida y vuelta: lo que se arma se vuelve a leer', () => {
        const url = buildCommunityInviteLink({
            communityIdOrSlug: 'running-club',
            token: 'AbC123xyz',
            referralCode: 'fran',
        });
        expect(parseCommunityDeepLink(url)).toEqual({
            communityIdOrSlug: 'running-club',
            inviteToken: 'AbC123xyz',
            referralCode: 'fran',
        });
    });
});

describe('link corto de invitación', () => {
    it('arma la forma corta', () => {
        expect(buildShortInviteLink('verano2026')).toBe('https://ramgos.app/i/verano2026');
    });

    it('es efectivamente más corto que la forma larga', () => {
        const corto = buildShortInviteLink('ab12cd34ef');
        const largo = buildCommunityInviteLink({
            communityIdOrSlug: 't579szcwcv794ts9xdcx0mnanh8cq18e',
            token: 'ab12cd34ef',
        });
        expect(corto.length).toBeLessThan(largo.length);
    });

    it('conserva el ref', () => {
        expect(buildShortInviteLink('tok', 'fran')).toBe('https://ramgos.app/i/tok?ref=fran');
        expect(parseShortInviteLink('https://ramgos.app/i/tok?ref=fran')).toEqual({
            inviteToken: 'tok',
            referralCode: 'fran',
        });
    });

    it('parsea las tres formas', () => {
        expect(parseShortInviteLink('https://ramgos.app/i/abc')?.inviteToken).toBe('abc');
        expect(parseShortInviteLink('ramgos://i/abc')?.inviteToken).toBe('abc');
        expect(parseShortInviteLink('/i/abc')?.inviteToken).toBe('abc');
    });

    it('rechaza hosts ajenos', () => {
        expect(parseShortInviteLink('https://evil.com/i/abc')).toBeNull();
    });

    it('no se confunde con otras rutas', () => {
        expect(parseShortInviteLink('/c/abc')).toBeNull();
        expect(parseShortInviteLink('/i')).toBeNull();
        expect(parseShortInviteLink('/i/abc/extra')).toBeNull();
        expect(parseShortInviteLink('/item/123')).toBeNull();
    });

    it('la forma larga NO la parsea el lector corto, y viceversa', () => {
        // Las dos ramas conviven en el resolver: si alguna mordiera la forma
        // de la otra, un link dejaría de abrir donde corresponde.
        expect(parseShortInviteLink('https://ramgos.app/c/abc?invite=tok')).toBeNull();
        expect(parseCommunityDeepLink('https://ramgos.app/i/tok')).toBeNull();
    });

    it('sin token no arma link', () => {
        expect(buildShortInviteLink('')).toBe('');
    });
});

describe('isCommunityDirectoryLink', () => {
    it('reconoce el directorio en las tres formas', () => {
        expect(isCommunityDirectoryLink('https://ramgos.app/comunidades')).toBe(true);
        expect(isCommunityDirectoryLink('ramgos://comunidades')).toBe(true);
        expect(isCommunityDirectoryLink('/comunidades')).toBe(true);
    });

    it('no confunde el directorio con una comunidad', () => {
        expect(isCommunityDirectoryLink('https://ramgos.app/c/abc')).toBe(false);
        expect(isCommunityDirectoryLink('https://ramgos.app/comunidades/abc')).toBe(false);
    });

    it('rechaza hosts ajenos', () => {
        expect(isCommunityDirectoryLink('https://evil.com/comunidades')).toBe(false);
    });
});
