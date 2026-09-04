module.exports = {
    preset: 'jest-expo',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    // Los tests de integración contra el deployment de audit corren con
    // jest.audit.config.js (npm run test:audit): necesitan Node puro, no el
    // entorno de React Native.
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/audit/.*\.integration\.test\.ts$'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
    ],
};
