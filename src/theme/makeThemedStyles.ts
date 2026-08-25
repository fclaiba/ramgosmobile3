/**
 * Caché de hojas de estilo por tema.
 *
 * El patrón `const styles = getStyles(isDark)` con el `StyleSheet.create`
 * adentro de la función recrea todas las reglas en cada render de cada
 * instancia. En una lista scrolleable eso son cientos de objetos de estilo
 * descartados por cambio de viewport.
 *
 * `createThemedStyles` mueve la creación a nivel de módulo y la memoiza en dos
 * entradas — claro y oscuro — que es la cantidad total de temas que existen.
 * Las hojas se construyen la primera vez que se pide cada tema, no al importar,
 * así el arranque no paga por pantallas que todavía no se abrieron.
 *
 * Se llama igual que antes, así que migrar un componente es cambiar la
 * definición y no los call sites:
 *
 *     const getStyles = createThemedStyles((isDark, c) => ({
 *         card: { backgroundColor: c.bg },
 *     }));
 *     // dentro del componente, sin cambios:
 *     const styles = getStyles(isDark);
 */
import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { colors } from './tokens';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/** Paleta semántica ya resuelta para el tema pedido. */
export type ThemeColors = ReturnType<typeof colors>;

export function createThemedStyles<T extends NamedStyles<T>>(
    factory: (isDark: boolean, c: ThemeColors) => T & NamedStyles<any>,
): (isDark: boolean) => T {
    let light: T | undefined;
    let dark: T | undefined;

    return (isDark: boolean): T => {
        if (isDark) {
            if (!dark) dark = StyleSheet.create(factory(true, colors(true)));
            return dark;
        }
        if (!light) light = StyleSheet.create(factory(false, colors(false)));
        return light;
    };
}
