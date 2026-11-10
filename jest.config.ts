import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/src/test/**/*.test.ts",
    "<rootDir>/src/services/__tests__/**/*.test.ts",
    "<rootDir>/src/routes/__tests__/**/*.test.ts",
  ],
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testTimeout: 180000,
  collectCoverageFrom: [
    "<rootDir>/src/services/**/*.ts",
    "<rootDir>/src/controllers/**/*.ts",
    "!<rootDir>/src/**/__tests__/**",
    "!<rootDir>/src/**/*.test.ts",
    "!<rootDir>/src/**/*.d.ts",
  ],
  coverageProvider: "v8",
  coverageThreshold: {
    // Jest's Config type requires global; the directory gates are enforced below.
    global: {},
    "./src/services/": { statements: 90, branches: 90 },
    "./src/controllers/": { statements: 90, branches: 90 },
  },
};

export = config;
