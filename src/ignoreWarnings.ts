import { LogBox } from 'react-native';

// Ignore deprecation warning from dependencies (e.g. react-navigation or others using SafeAreaView from react-native)
if (__DEV__) {
    const originalWarn = console.warn;
    const originalError = console.error;

    const ignoredWarnings = [
        'SafeAreaView has been deprecated',
        'Support for defaultProps will be removed',
        '"shadow*" style props are deprecated',
        '[Reanimated] Reduced motion setting is enabled',
        '[expo-notifications] Listening to push token changes is not yet fully supported on web',
        'Animated: `useNativeDriver` is not supported'
    ];

    console.warn = (...args) => {
        const log = args[0];
        if (typeof log === 'string' && ignoredWarnings.some(warning => log.includes(warning))) {
            return;
        }
        originalWarn(...args);
    };

    console.error = (...args) => {
        const log = args[0];
        if (typeof log === 'string' && ignoredWarnings.some(warning => log.includes(warning))) {
            return;
        }
        originalError(...args);
    };

    LogBox.ignoreLogs(ignoredWarnings);
}
