/**
 * Config de Jest para `tests/audit/*.integration.test.ts`.
 *
 * Separada del preset `jest-expo` a propósito: ese preset carga el entorno de
 * React Native, cuyo `fetch` es un polyfill sobre un XMLHttpRequest mockeado
 * que no hace red. Acá hace falta Node de verdad para hablar con el deployment
 * de audit. Se corre con `npm run test:audit`.
 */
module.exports = {
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/tests/audit/**/*.integration.test.ts'],
    transform: { '^.+\.[tj]sx?$': 'babel-jest' },
    transformIgnorePatterns: ['node_modules/(?!(convex)/)'],
    testTimeout: 120_000,
};
