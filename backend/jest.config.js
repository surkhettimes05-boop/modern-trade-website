export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-after-env.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    // Keep runtime entry points in coverage without compiling ESM as CommonJS.
    '^.+/src/(index|start|worker|database/(bootstrapAdmin|deployMigrate|migrate|seed|verifyDatabaseRole))\\.ts$': '<rootDir>/test/entrypoint-transform.cjs',
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: { module: "CommonJS", moduleResolution: "node" },
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
