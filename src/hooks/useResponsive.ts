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
    };
}
