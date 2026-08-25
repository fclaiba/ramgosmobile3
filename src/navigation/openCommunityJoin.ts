/**
 * Punto único de entrada al modal de ingreso a una comunidad.
 *
 * Mismo criterio que `openUserProfile`: una sola función que todos los call
 * sites usan, en vez de que cada pantalla monte su propio sheet y elija su
 * propio nombre de parámetro. Acá además hace falta porque el modal tiene que
 * poder abrirse desde FUERA del árbol de una pantalla — el handler de deep
 * links corre antes de que ninguna esté montada.
 *
 * Es un store externo mínimo, igual que `sessionTokenStore`: quien abre no
 * necesita contexto y `CommunityJoinHost` lo escucha desde la raíz.
 */

export interface CommunityJoinRequest {
    /**
     * Ausente cuando el link es la forma corta `/i/{código}`: ahí el token es
     * lo único que hay, y `previewInvite` resuelve la comunidad del lado del
     * servidor. Omitirlo es deliberado — evita revelar de qué comunidad se
     * trata antes de aceptar, que para una secreta es justamente el punto.
     */
    communityIdOrSlug?: string;
    inviteToken?: string;
    /** Se conserva para no perder la atribución del influencer (E-089). */
    referralCode?: string;
}

type Listener = () => void;

let current: CommunityJoinRequest | null = null;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((listener) => listener());

export const communityJoinStore = {
    get: (): CommunityJoinRequest | null => current,
    subscribe: (listener: Listener): (() => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

/** Abre el modal. Necesita al menos una comunidad o un token; sin nada, no hace nada. */
export function openCommunityJoin(request: CommunityJoinRequest) {
    if (!request?.communityIdOrSlug && !request?.inviteToken) return;
    current = request;
    notify();
}

export function closeCommunityJoin() {
    if (current === null) return;
    current = null;
    notify();
}
