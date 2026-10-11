/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@sitewright/db$': '<rootDir>/../../prisma/src/index.ts',
    '^@sitewright/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@sitewright/places-client$': '<rootDir>/../../packages/places-client/src/index.ts',
    '^@sitewright/email-adapters$': '<rootDir>/../../packages/email-adapters/src/index.ts',
    '^@sitewright/enrichment-adapters$': '<rootDir>/../../packages/enrichment-adapters/src/index.ts',
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
  forceExit: true,
};
