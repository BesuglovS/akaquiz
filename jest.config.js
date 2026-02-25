module.exports = {
  testEnvironment: "node",
  collectCoverageFrom: ["src/**/*.js", "!src/**/*.test.js", "!src/**/*.spec.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testMatch: ["**/__tests__/**/*.js", "**/*.test.js", "**/*.spec.js"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  verbose: true,
  testTimeout: 10000,
};
