// Global test setup
global.console = {
  ...console,
  // Suppress console.log during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Socket.IO for unit tests
jest.mock("socket.io", () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  })),
}));

// Mock Socket.IO client for tests
jest.mock("socket.io-client", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  })),
}));

// Setup global test utilities
global.testUtils = {
  createMockSocket: () => ({
    id: "test-socket-id",
    nickname: "test-user",
    isHost: false,
    answered: false,
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
  }),

  createMockQuestion: (overrides = {}) => ({
    question: "Test question?",
    questionImg: null,
    options: [
      { text: "Option 1", img: null },
      { text: "Option 2", img: null },
      { text: "Option 3", img: null },
    ],
    correct: 0,
    ...overrides,
  }),

  createMockQuizData: (questionCount = 3) => {
    return Array.from({ length: questionCount }, (_, index) => ({
      question: `Question ${index + 1}?`,
      questionImg: null,
      options: [
        { text: `Option 1 for Q${index + 1}`, img: null },
        { text: `Option 2 for Q${index + 1}`, img: null },
        { text: `Option 3 for Q${index + 1}`, img: null },
      ],
      correct: index % 3,
    }));
  },
};
