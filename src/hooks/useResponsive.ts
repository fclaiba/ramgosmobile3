import { useWindowDimensions } from 'react-native';

export function useResponsive() {
    const { width, height } = useWindowDimensions();

    // Breakpoints
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;

    // Derived values
    const isSmallScreen = isMobile;
    const isLargeScreen = isTablet || isDesktop;

    // Grid columns based on screen width
    let numColumns = 2;
    if (isDesktop) {
        numColumns = 4;
    } else if (isTablet) {
        numColumns = 3;
    }

    // Recommended max widths
    const maxContainerWidth = 1200;

    /**
     * Ancho de la columna de contenido en lecturas verticales: feed, tabs,
     * directorio.
     *
     * `maxContainerWidth` (1200) sirve para grillas de productos, pero un post
     * estirado a 1200 px es ilegible — la línea de texto se vuelve
     * inseguible y la media queda gigante. 600 es el ancho de columna que usan
     * X e Instagram en escritorio.
     *
     * En mobile no aplica: la columna ES la pantalla.
     */
    const feedMaxWidth = isMobile ? width : 600;

    /**
     * Ancho del video vertical a pantalla completa (Loops) en escritorio. Sin
     * tope, un 9:16 en una pantalla ancha se recorta o se estira; acotado,
     * queda como un teléfono centrado sobre fondo negro, que es lo que hacen
     * TikTok y Reels en web.
     */
    const immersiveMaxWidth = isMobile ? width : Math.min(width, Math.round(height * 0.5625));

    return {
        width,
        height,
        isMobile,
        isTablet,
        isDesktop,
        isSmallScreen,
        isLargeScreen,
        numColumns,
        maxContainerWidth,
        feedMaxWidth,
        immersiveMaxWidth,
    };
}
