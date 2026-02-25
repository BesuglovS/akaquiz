// Global test setup for E2E tests
// No socket.io mocking - we use real sockets for E2E tests

// Set test environment variables
process.env.HOST_PASSWORD = "test-password-e2e";

// Suppress console.log during tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Increase timeout for E2E tests
jest.setTimeout(30000);
