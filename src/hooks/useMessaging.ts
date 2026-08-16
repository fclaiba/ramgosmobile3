import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hooks de mensajería.
 *
 * Detalle clave: una query de Convex sólo se re-ejecuta cuando cambian los
 * datos que leyó, nunca por el paso del tiempo. Por eso el backend devuelve
 * timestamps crudos (`lastSeenAt`, `expiresAt`) y el "activo ahora" / el
 * indicador de "escribiendo…" se evalúan acá con un tick local.
 */

/** Fuerza un re-render cada `ms` para reevaluar estados que dependen del reloj. */
export function useClockTick(ms: number, enabled = true) {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(() => setTick((t) => t + 1), ms);
        return () => clearInterval(id);
    }, [ms, enabled]);
}

/** Badge global de mensajes sin leer + solicitudes pendientes. */
export function useUnreadMessages() {
    const { sessionToken } = useAuth();
    const data = useQuery(
        api.social.dm.getUnreadTotal,
        sessionToken ? { sessionToken } : 'skip',
    );
    return {
        unreadCount: data?.total ?? 0,
        requestCount: data?.requests ?? 0,
    };
}

/**
 * Publica presencia mientras la app está en foreground. El servidor descarta
 * los latidos redundantes, así que el costo real es ~1 escritura por minuto.
 */
export function usePresenceHeartbeat() {
    const { sessionToken } = useAuth();
    const heartbeat = useMutation(api.social.dm.heartbeat);

    useEffect(() => {
        if (!sessionToken) return;
        let cancelled = false;

        const ping = (state: 'foreground' | 'background') => {
            if (cancelled) return;
            heartbeat({ sessionToken, state }).catch(() => {});
        };

        ping('foreground');
        const id = setInterval(() => ping('foreground'), 60_000);
        const sub = AppState.addEventListener('change', (next) => {
            ping(next === 'active' ? 'foreground' : 'background');
        });

        return () => {
            cancelled = true;
            clearInterval(id);
            sub.remove();
        };
    }, [sessionToken, heartbeat]);
}

/**
 * Indicador "escribiendo…". Filtra por TTL con el reloj local y agrupa los
 * nombres como lo hace Instagram.
 */
export function useTypingIndicator(chatId?: string) {
    const { sessionToken } = useAuth();
    const rows = useQuery(
        api.social.dm.getTyping,
        chatId && sessionToken ? { chatId: chatId as any, sessionToken } : 'skip',
    );
    useClockTick(1000, !!rows?.length);

    const now = Date.now();
    const active = (rows ?? []).filter((r: any) => r.expiresAt > now);
    if (!active.length) return null;
    if (active.length === 1) return `${active[0].displayName} está escribiendo…`;
    return `${active.length} personas están escribiendo…`;
}

/**
 * Envía el heartbeat de "escribiendo" con debounce: como mucho uno cada 4s
 * mientras se teclea, y un `false` explícito al enviar o salir.
 */
export function useTypingSignal(chatId?: string) {
    const { sessionToken } = useAuth();
    const setTyping = useMutation(api.social.dm.setTyping);
    const [lastSent, setLastSent] = useState(0);

    const signalTyping = () => {
        if (!chatId || !sessionToken) return;
        const now = Date.now();
        if (now - lastSent < 4000) return;
        setLastSent(now);
        setTyping({ chatId: chatId as any, sessionToken, typing: true }).catch(() => {});
    };

    const stopTyping = () => {
        if (!chatId || !sessionToken) return;
        setLastSent(0);
        setTyping({ chatId: chatId as any, sessionToken, typing: false }).catch(() => {});
    };

    useEffect(() => stopTyping, [chatId]);

    return { signalTyping, stopTyping };
}
