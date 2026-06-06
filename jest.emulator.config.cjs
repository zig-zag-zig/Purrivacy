/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests/emulator'],
  setupFiles: ['<rootDir>/tests/setupEmulatorEnv.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
