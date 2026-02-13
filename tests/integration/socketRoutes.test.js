const setupSocketRoutes = require("../../src/routes/socketRoutes");
const gameService = require("../../src/services/gameService");
const { loadQuizFile } = require("../../src/utils/quizParser");

// Mock dependencies
jest.mock("../../src/services/gameService");
jest.mock("../../src/utils/quizParser");

describe("socketRoutes integration", () => {
  let mockIo;
  let mockSocket;
  let mockServerSocket;

  beforeEach(() => {
    // Mock Socket.IO server
    mockServerSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };

    mockIo = {
      on: jest.fn((event, callback) => {
        if (event === "connection") {
          // Simulate connection event
          callback(mockSocket);
        }
      }),
    };

    // Mock socket
    mockSocket = {
      id: "test-socket-id",
      nickname: null,
      isHost: false,
      answered: false,
      emit: jest.fn(),
      on: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock game service
    gameService.loadQuiz.mockReturnValue({ success: true });
    gameService.getNextQuestion.mockReturnValue({
      question: "Test question?",
      options: [{ text: "Option 1" }, { text: "Option 2" }],
      timeLeft: 15,
      questionNumber: 1,
      totalQuestions: 10,
    });
    gameService.processAnswer.mockReturnValue({
      success: true,
      isCorrect: true,
    });
    gameService.endCurrentQuestion.mockReturnValue({
      correctAnswer: 0,
      currentOptions: [{ text: "Option 1" }, { text: "Option 2" }],
      votes: { 0: 2, 1: 1 },
    });
    gameService.getAllPlayersScores.mockReturnValue({});
    gameService.getAnalytics.mockReturnValue({});
    gameService.getQuestionAnalytics.mockReturnValue({});
    gameService.exportResultsToCSV.mockReturnValue("CSV content");

    // Setup routes
    setupSocketRoutes(mockIo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("host authentication", () => {
    test("should authenticate host with correct password", () => {
      process.env.HOST_PASSWORD = "test-password";

      // Simulate authenticateHost event
      const authenticateHostHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "authenticateHost",
      )[1];

      authenticateHostHandler("test-password");

      expect(mockSocket.emit).toHaveBeenCalledWith("hostAuthResult", {
        success: true,
      });
      expect(mockSocket.isHost).toBe(true);
    });

    test("should reject host with wrong password", () => {
      process.env.HOST_PASSWORD = "test-password";

      const authenticateHostHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "authenticateHost",
      )[1];

      authenticateHostHandler("wrong-password");

      expect(mockSocket.emit).toHaveBeenCalledWith("hostAuthResult", {
        success: false,
        reason: "wrong_password",
      });
      expect(mockSocket.isHost).toBe(false);
    });

    test("should prevent multiple hosts", () => {
      process.env.HOST_PASSWORD = "test-password";
      mockSocket.isHost = true; // Simulate existing host

      const authenticateHostHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "authenticateHost",
      )[1];

      authenticateHostHandler("test-password");

      expect(mockSocket.emit).toHaveBeenCalledWith("hostAuthResult", {
        success: false,
        reason: "already_host",
      });
    });
  });

  describe("quiz management", () => {
    beforeEach(() => {
      mockSocket.isHost = true;
      loadQuizFile.mockReturnValue([
        {
          question: "Test question?",
          options: [{ text: "Option 1" }, { text: "Option 2" }],
          correct: 0,
        },
      ]);
    });

    test("should get quiz list", () => {
      const getQuizListHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "getQuizList",
      )[1];

      getQuizListHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "quizList",
        expect.any(Array),
      );
    });

    test("should select quiz successfully", () => {
      const selectQuizHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "selectQuiz",
      )[1];

      selectQuizHandler({
        fileName: "test.txt",
        shuffle: false,
        questionCount: null,
      });

      expect(gameService.loadQuiz).toHaveBeenCalledWith(
        "test.txt",
        false,
        null,
      );
      expect(mockIo.emit).toHaveBeenCalledWith("quizReady", "test.txt");
    });

    test("should handle quiz selection error", () => {
      gameService.loadQuiz.mockReturnValue({
        success: false,
        error: "File not found",
      });

      const selectQuizHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "selectQuiz",
      )[1];

      selectQuizHandler({
        fileName: "non-existent.txt",
        shuffle: false,
        questionCount: null,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("quizError", {
        message: "File not found",
      });
    });
  });

  describe("player management", () => {
    test("should join with valid nickname", () => {
      const joinHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "join",
      )[1];

      joinHandler("test-player");

      expect(mockSocket.nickname).toBe("test-player");
      expect(mockSocket.emit).not.toHaveBeenCalledWith("joinError");
    });

    test("should reject duplicate nickname", () => {
      // Simulate another socket with same nickname
      const existingSocket = { nickname: "test-player" };

      // Mock activeSockets to include existing player
      const activeSockets = new Map();
      activeSockets.set("existing-id", existingSocket);

      const joinHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "join",
      )[1];

      joinHandler("test-player");

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "joinError",
        expect.stringContaining("уже занят"),
      );
    });

    test("should reject invalid nickname", () => {
      const joinHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "join",
      )[1];

      joinHandler(""); // Empty nickname

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "joinError",
        expect.any(String),
      );
    });
  });

  describe("game flow", () => {
    beforeEach(() => {
      mockSocket.isHost = true;
      gameService.isCurrentQuestionActive.mockReturnValue(false);
      gameService.currentQuestionIndex = 0;
      gameService.quizData = [
        {
          question: "Test question?",
          options: [{ text: "Option 1" }, { text: "Option 2" }],
          correct: 0,
        },
      ];
    });

    test("should start next question", () => {
      const nextQuestionHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "nextQuestion",
      )[1];

      nextQuestionHandler();

      expect(gameService.getNextQuestion).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith(
        "updateQuestion",
        expect.objectContaining({
          question: "Test question?",
          options: expect.any(Array),
          timeLeft: 15,
        }),
      );
    });

    test("should end current question when called again", () => {
      gameService.isCurrentQuestionActive.mockReturnValue(true);
      gameService.getAllPlayersScores.mockReturnValue({ player1: 100 });

      const nextQuestionHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "nextQuestion",
      )[1];

      nextQuestionHandler();

      expect(gameService.endCurrentQuestion).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith(
        "timeOver",
        expect.objectContaining({
          scores: { player1: 100 },
          correctAnswer: 0,
        }),
      );
    });

    test("should reset game", () => {
      const resetGameHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "resetGame",
      )[1];

      resetGameHandler();

      expect(gameService.resetGame).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith("gameReset");
    });
  });

  describe("player interaction", () => {
    beforeEach(() => {
      mockSocket.nickname = "test-player";
      mockSocket.isHost = false;
      gameService.isCurrentQuestionActive.mockReturnValue(true);
      gameService.currentQuestionIndex = 0;
      gameService.questionStartTime = Date.now() - 5000;
      gameService.quizData = [
        {
          question: "Test question?",
          options: [{ text: "Option 1" }, { text: "Option 2" }],
          correct: 0,
        },
      ];
    });

    test("should submit correct answer", () => {
      const submitAnswerHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "submitAnswer",
      )[1];

      submitAnswerHandler(0); // Correct answer

      expect(gameService.processAnswer).toHaveBeenCalledWith(
        "test-player",
        0,
        expect.any(Number),
      );
      expect(mockSocket.answered).toBe(true);
    });

    test("should not submit answer when question is not active", () => {
      gameService.isCurrentQuestionActive.mockReturnValue(false);

      const submitAnswerHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "submitAnswer",
      )[1];

      submitAnswerHandler(0);

      expect(gameService.processAnswer).not.toHaveBeenCalled();
    });

    test("should not submit duplicate answer", () => {
      mockSocket.answered = true;

      const submitAnswerHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "submitAnswer",
      )[1];

      submitAnswerHandler(0);

      expect(gameService.processAnswer).not.toHaveBeenCalled();
    });
  });

  describe("analytics and export", () => {
    beforeEach(() => {
      mockSocket.isHost = true;
    });

    test("should get analytics", () => {
      const getAnalyticsHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "getAnalytics",
      )[1];

      getAnalyticsHandler();

      expect(gameService.getAnalytics).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "analyticsData",
        expect.any(Object),
      );
    });

    test("should get question analytics", () => {
      const getQuestionAnalyticsHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "getQuestionAnalytics",
      )[1];

      getQuestionAnalyticsHandler(0);

      expect(gameService.getQuestionAnalytics).toHaveBeenCalledWith(0);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "questionAnalyticsData",
        expect.any(Object),
      );
    });

    test("should export results to CSV", () => {
      const exportResultsHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "exportResults",
      )[1];

      exportResultsHandler();

      expect(gameService.exportResultsToCSV).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "csvExportReady",
        "CSV content",
      );
    });
  });

  describe("disconnection handling", () => {
    test("should handle host disconnection", () => {
      mockSocket.isHost = true;

      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "disconnect",
      )[1];

      disconnectHandler();

      expect(mockSocket.isHost).toBe(false);
    });

    test("should handle player disconnection", () => {
      mockSocket.nickname = "test-player";

      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "disconnect",
      )[1];

      disconnectHandler();

      expect(mockSocket.nickname).toBe(null);
    });
  });
});
