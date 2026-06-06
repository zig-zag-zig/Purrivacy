/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/emulator/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
