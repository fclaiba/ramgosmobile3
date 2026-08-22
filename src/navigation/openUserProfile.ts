/**
 * Punto único de entrada al perfil público de un usuario.
 *
 * La ruta se llama `CommercialProfile` por razones históricas, pero el screen
 * (`src/screens/CommercialProfileScreen.tsx`) es el perfil híbrido: tiene el
 * toggle Social/Comercial. Antes cada call site elegía su propio nombre de
 * parámetro (`sellerId`, `userId`, `id`), así que centralizamos en `userId`.
 */
export function openUserProfile(navigation: any, userId?: string | null) {
    if (!userId || !navigation) return;
    navigation.navigate('CommercialProfile', { userId: String(userId) });
}

/** Igual que `openUserProfile`, pero apila — para saltar de perfil a perfil. */
export function pushUserProfile(navigation: any, userId?: string | null) {
    if (!userId || !navigation) return;
    if (typeof navigation.push === 'function') {
        navigation.push('CommercialProfile', { userId: String(userId) });
        return;
    }
    openUserProfile(navigation, userId);
}
