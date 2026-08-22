export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup-env.cjs"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: { "^.+\\.tsx?$": ["ts-jest", { useESM: true }] },
  testMatch: [
    "<rootDir>/src/config/**/__tests__/**/*.test.ts",
    "<rootDir>/src/contracts/**/__tests__/**/*.test.ts",
    "<rootDir>/src/utils/**/__tests__/**/*.test.ts",
    "<rootDir>/src/routes/**/__tests__/authSecurity.test.ts",
    "<rootDir>/src/middleware/**/__tests__/**/*.test.ts",
    "<rootDir>/src/services/**/__tests__/shoppingCartSecurity.test.ts",
    "<rootDir>/src/services/**/__tests__/twilioVerifyService.test.ts",
    "<rootDir>/src/services/**/__tests__/demoOtpService.test.ts",
  ],
  maxWorkers: 1,
};
