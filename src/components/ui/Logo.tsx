/**
 * Logo de Ramgos.
 *
 * Existe porque el logo se montaba con `require('../../logo.png')` inline en
 * tres pantallas (`MobileHeader`, `DesktopSidebar`, `WelcomeScreen`), cada una
 * con su caja hardcodeada. Ninguna de esas cajas respetaba el aspecto real del
 * archivo: el header pedía 140x40 (3.5:1) y el sidebar 160x44 (3.64:1) para una
 * imagen que es 2.79:1. Con `resizeMode="contain"` eso no deforma, pero deja el
 * logo más chico que la caja y con aire muerto a los costados.
 *
 * Acá el alto es la única medida que se pasa y el ancho sale del aspecto, así
 * que el logo siempre ocupa exactamente lo que dice ocupar.
 *
 * Dos variantes:
 *   - `wordmark`  el logo completo "RAMGOS" — para headers y pantallas de marca.
 *   - `isotype`   sólo el símbolo (la R con la bolsa y el carrito) — para
 *                 espacios cuadrados o angostos.
 *
 * Los íconos de la app (launcher, splash, favicon) NO salen de acá: se generan
 * con `scripts/generate-app-icons.js` y se configuran en `app.json`.
 */
import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const WORDMARK = require('../../../logo.png');
const ISOTYPE = require('../../../public/logo.png');

/** Relación ancho/alto medida sobre los archivos: 1632x584 y 413x399. */
const ASPECT = {
    wordmark: 1632 / 584,
    isotype: 413 / 399,
} as const;

export type LogoVariant = keyof typeof ASPECT;

export const Logo = ({
    variant = 'wordmark',
    height = 40,
    style,
    accessibilityLabel = 'Ramgos',
}: {
    variant?: LogoVariant;
    height?: number;
    style?: StyleProp<ImageStyle>;
    accessibilityLabel?: string;
}) => (
    <Image
        source={variant === 'isotype' ? ISOTYPE : WORDMARK}
        style={[{ height, width: height * ASPECT[variant] }, style]}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
    />
);

export default Logo;
