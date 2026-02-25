// Jest configuration for E2E tests
// This config does NOT mock socket.io-client, allowing real socket connections
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/e2e/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup-e2e.js"],
  verbose: true,
  testTimeout: 30000,
  // Don't use the global setup.js which mocks socket.io
  modulePathIgnorePatterns: ["tests/setup.js"],
};
