/**
 * Monta el modal de ingreso a comunidades una sola vez, a la altura del
 * navigator.
 *
 * Va acá y no dentro de una pantalla porque el modal tiene que poder abrirse
 * cuando un deep link levanta la app, antes de que haya ninguna pantalla
 * montada, y porque `Sheet` usa un `<Modal>` de RN: se pinta por encima de
 * todo el stack, sea cual sea la pantalla activa.
 */
import React, { useSyncExternalStore } from 'react';
import {
    closeCommunityJoin,
    communityJoinStore,
} from './openCommunityJoin';
import { CommunityJoinSheet } from '../components/social/CommunityJoinSheet';
import { navigationRef } from './navigationRef';

export function CommunityJoinHost() {
    const request = useSyncExternalStore(
        communityJoinStore.subscribe,
        communityJoinStore.get,
        communityJoinStore.get,
    );

    if (!request) return null;

    return (
        <CommunityJoinSheet
            open
            communityIdOrSlug={request.communityIdOrSlug}
            inviteToken={request.inviteToken}
            onClose={closeCommunityJoin}
            onJoined={(communityId) => {
                closeCommunityJoin();
                // Recién entrado: se lo lleva adentro en vez de dejarlo mirando
                // la pantalla desde la que tocó el link.
                // El navigator no está tipado (stack declarado inline en
                // `App.tsx`), así que el ref no conoce estas rutas.
                if (navigationRef?.isReady?.()) {
                    (navigationRef as any).navigate('CommunityDetail', { communityId });
                }
            }}
        />
    );
}
