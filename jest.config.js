/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.spec.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts',
    ],
    coverageDirectory: 'coverage',
};
