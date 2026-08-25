/**
 * Blindaje del resolver de deep links.
 *
 * Esta función decide a qué pantalla entra cada link compartido y estuvo sin
 * tests desde siempre. En E-089 descartaba el `?ref=` de las URLs de producto:
 * el link abría el producto pero la comisión del influencer se perdía. Los
 * casos de referido de acá abajo existen para que eso no vuelva a pasar, ni
 * por la rama vieja ni por la de comunidades.
 */
import { createAppGetStateFromPath, RESERVED_PATHS } from '../getStateFromPath';

const fallback = jest.fn((path: string) => ({ __fallback: path }));
const getStateFromPath = createAppGetStateFromPath(fallback);

beforeEach(() => fallback.mockClear());

const route = (result: any) => result?.routes?.[0];

describe('bono (rama 1, sin cambios)', () => {
    it('/ref/{code}?bono=ID abre el item con las DOS cosas', () => {
        const r = route(getStateFromPath('/ref/FRAN?bono=item123'));
        expect(r.name).toBe('ItemDetail');
        expect(r.params).toMatchObject({ itemId: 'item123', referralCode: 'FRAN' });
    });

    it('ramgos://bono/ID?ref=CODE también', () => {
        const r = route(getStateFromPath('ramgos://bono/item123?ref=FRAN'));
        expect(r.name).toBe('ItemDetail');
        expect(r.params).toMatchObject({ itemId: 'item123', referralCode: 'FRAN' });
    });
});

describe('comunidad (rama 2, nueva)', () => {
    it('/c/{id} abre el detalle de la comunidad', () => {
        const r = route(getStateFromPath('/c/abc123'));
        expect(r.name).toBe('CommunityDetail');
        expect(r.params.communityId).toBe('abc123');
        expect(r.params.inviteToken).toBeUndefined();
    });

    it('/c/{id}?invite=TOKEN lleva el token', () => {
        const r = route(getStateFromPath('/c/abc123?invite=TOK999'));
        expect(r.name).toBe('CommunityDetail');
        expect(r.params).toMatchObject({ communityId: 'abc123', inviteToken: 'TOK999' });
    });

    it('conserva invite Y ref a la vez', () => {
        const r = route(getStateFromPath('/c/abc123?invite=TOK&ref=FRAN'));
        expect(r.params).toMatchObject({
            communityId: 'abc123',
            inviteToken: 'TOK',
            referralCode: 'FRAN',
        });
    });

    it('funciona por scheme y por URL web completa', () => {
        expect(route(getStateFromPath('ramgos://c/abc'))?.params.communityId).toBe('abc');
        expect(route(getStateFromPath('https://ramgos.app/c/abc'))?.params.communityId).toBe('abc');
    });

    it('NO cae en ProductDetail — el bug que introduciría sin reservedPaths', () => {
        // Con `/c/abc` siendo dos segmentos, la rama de handles lo habría
        // resuelto como ProductDetail{handle:'c', slug:'abc'}.
        const r = route(getStateFromPath('/c/abc'));
        expect(r.name).not.toBe('ProductDetail');
        expect(r.name).toBe('CommunityDetail');
    });

    it('/comunidades abre el directorio, no el perfil de "comunidades"', () => {
        const r = route(getStateFromPath('/comunidades'));
        expect(r.name).toBe('Communities');
        expect(r.name).not.toBe('CommercialProfile');
    });
});

describe('perfiles y productos (rama 4, sin cambios)', () => {
    it('/{handle} abre el perfil comercial', () => {
        const r = route(getStateFromPath('/tienda'));
        expect(r.name).toBe('CommercialProfile');
        expect(r.params.handle).toBe('tienda');
    });

    it('/{handle}/{slug} abre el producto', () => {
        const r = route(getStateFromPath('/tienda/zapatilla'));
        expect(r.name).toBe('ProductDetail');
        expect(r.params).toMatchObject({ handle: 'tienda', slug: 'zapatilla' });
    });

    it('REGRESIÓN E-089: /{handle}/{slug}?ref=CODE conserva el referido', () => {
        const r = route(getStateFromPath('/tienda/zapatilla?ref=FRAN'));
        expect(r.name).toBe('ProductDetail');
        expect(r.params.referralCode).toBe('FRAN');
    });

    it('E-089 con URL absoluta, que es como llega desde el navegador', () => {
        const r = route(getStateFromPath('https://ramgos.app/tienda/zapatilla?ref=FRAN'));
        expect(r.params.referralCode).toBe('FRAN');
    });

    it('E-089 con el ref escapado', () => {
        const r = route(getStateFromPath('/tienda/zapatilla?ref=fran%20lopez'));
        expect(r.params.referralCode).toBe('fran lopez');
    });

    it('E-089 con el ref después de otros parámetros', () => {
        const r = route(getStateFromPath('/tienda/zapatilla?utm=x&ref=FRAN'));
        expect(r.params.referralCode).toBe('FRAN');
    });
});

describe('rutas reservadas', () => {
    it('ninguna reservada se interpreta como handle de perfil', () => {
        for (const reserved of RESERVED_PATHS) {
            const r = route(getStateFromPath(`/${reserved}`));
            expect(r?.name).not.toBe('CommercialProfile');
        }
    });

    it('las reservadas de dos segmentos no se interpretan como producto', () => {
        for (const reserved of RESERVED_PATHS) {
            const r = route(getStateFromPath(`/${reserved}/algo`));
            expect(r?.name).not.toBe('ProductDetail');
        }
    });

    it('la reserva es insensible a mayúsculas', () => {
        expect(route(getStateFromPath('/Login'))?.name).not.toBe('CommercialProfile');
        expect(route(getStateFromPath('/HOME'))?.name).not.toBe('CommercialProfile');
    });
});

describe('nombres de pantalla no son handles (regresión del invite roto)', () => {
    // En web React Navigation reescribe la URL en cada navegación, y para una
    // pantalla sin patrón en `linking.config` usa el nombre de la pantalla.
    // Esa URL, re-parseada, abría "Perfil no disponible" — que es lo que se veía
    // al entrar por un enlace de invitación.
    const screenNames = [
        'ProductDetail',
        'CommercialProfile',
        'CommunitySettings',
        'CommunityDetail',
        'CreateCommunity',
        'ItemDetail',
        'StoryComposer',
        'MyListings',
    ];

    it('ningún nombre de pantalla se resuelve como perfil', () => {
        for (const name of screenNames) {
            const r = route(getStateFromPath(`/${name}`));
            expect(r?.name).not.toBe('CommercialProfile');
        }
    });

    it('tampoco como producto en dos segmentos', () => {
        expect(route(getStateFromPath('/ProductDetail/algo'))?.name).not.toBe('ProductDetail');
    });

    it('pero un handle real sigue funcionando', () => {
        expect(route(getStateFromPath('/tienda'))?.name).toBe('CommercialProfile');
        expect(route(getStateFromPath('/fran-lopez'))?.name).toBe('CommercialProfile');
        expect(route(getStateFromPath('/tienda2026'))?.name).toBe('CommercialProfile');
    });

    it('un handle de una sola palabra capitalizada NO se confunde con pantalla', () => {
        // El límite de la heurística: hace falta un segundo tramo en mayúscula
        // para considerarlo nombre de pantalla.
        expect(route(getStateFromPath('/Fran'))?.name).toBe('CommercialProfile');
    });
});

describe('fallback', () => {
    it('delega las rutas declaradas en linking.config', () => {
        getStateFromPath('/chat/abc/extra/segmentos');
        expect(fallback).toHaveBeenCalled();
    });

    it('delega la raíz', () => {
        getStateFromPath('/');
        expect(fallback).toHaveBeenCalled();
    });

    it('un path de 3+ segmentos no inventa una pantalla', () => {
        const result: any = getStateFromPath('/a/b/c');
        expect(result.__fallback).toBe('/a/b/c');
    });
});
