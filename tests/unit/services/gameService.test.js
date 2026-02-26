const gameService = require("../../../src/services/gameService");
const { loadQuizFile, shuffleArray } = require("../../../src/utils/quizParser");

// Mock the quiz parser
jest.mock("../../../src/utils/quizParser");

describe("GameService", () => {
  let gameService;
  let mockQuizData;

  beforeEach(() => {
    gameService = require("../../../src/services/gameService");
    gameService.resetGame();
    mockQuizData = [
      {
        question: "Question 1?",
        questionImg: null,
        options: [
          { text: "Option 1", img: null },
          { text: "Option 2", img: null },
          { text: "Option 3", img: null },
        ],
        correct: 0,
      },
      {
        question: "Question 2?",
        questionImg: null,
        options: [
          { text: "Option A", img: null },
          { text: "Option B", img: null },
          { text: "Option C", img: null },
        ],
        correct: 1,
      },
    ];
  });

  describe("loadQuiz", () => {
    test("should load quiz successfully", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => arr); // Return same array for non-shuffle tests

      const result = gameService.loadQuiz("test.txt", false, null);

      expect(result.success).toBe(true);
      expect(result.fileName).toBe("test.txt");
      expect(result.shuffle).toBe(false);
      expect(result.questionCount).toBe(2);
      expect(gameService.quizData).toHaveLength(2);
      expect(gameService.currentQuestionIndex).toBe(-1);
    });

    test("should shuffle questions when shuffle is true", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => [...arr].reverse()); // Mock shuffle

      const result = gameService.loadQuiz("test.txt", true, null);

      expect(result.success).toBe(true);
      expect(result.shuffle).toBe(true);
      expect(gameService.quizData).toHaveLength(2);
      expect(shuffleArray).toHaveBeenCalledWith(mockQuizData);
    });

    test("should limit questions when questionCount is specified", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => arr);

      const result = gameService.loadQuiz("test.txt", false, 1);

      expect(result.success).toBe(true);
      expect(result.questionCount).toBe(1);
      expect(gameService.quizData).toHaveLength(1);
    });

    test("should handle loadQuiz error", () => {
      loadQuizFile.mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = gameService.loadQuiz("non-existent.txt");

      expect(result.success).toBe(false);
      expect(result.error).toBe("File not found");
    });
  });

  describe("getNextQuestion", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
    });

    test("should return next question", () => {
      const question = gameService.getNextQuestion();

      expect(question).toBeDefined();
      expect(question.question).toBe("Question 1?");
      expect(question.options).toHaveLength(3);
      expect(question.questionNumber).toBe(1);
      expect(question.totalQuestions).toBe(2);
      expect(gameService.isQuestionActive).toBe(true);
    });

    test("should return null when no more questions", () => {
      gameService.currentQuestionIndex = 1;
      gameService.isQuestionActive = false;

      const question = gameService.getNextQuestion();

      expect(question).toBeNull();
    });

    test("should not return question when current question is active", () => {
      gameService.isQuestionActive = true;

      const question = gameService.getNextQuestion();

      expect(question).toBeNull();
    });
  });

  describe("endCurrentQuestion", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
      gameService.votes = { 0: 2, 1: 1 };
    });

    test("should end current question and return results", () => {
      const result = gameService.endCurrentQuestion();

      expect(result).toBeDefined();
      expect(result.correctAnswer).toBe(0);
      expect(result.votes).toEqual({ 0: 2, 1: 1 });
      expect(gameService.isQuestionActive).toBe(false);
    });

    test("should return null when no active question", () => {
      gameService.isQuestionActive = false;

      const result = gameService.endCurrentQuestion();

      expect(result).toBeNull();
    });
  });

  describe("processAnswer", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
      gameService.questionStartTime = Date.now() - 5000; // 5 seconds ago
    });

    test("should process correct answer and award points", () => {
      const result = gameService.processAnswer("player1", 0, 5);

      expect(result.success).toBe(true);
      expect(result.isCorrect).toBe(true);
      expect(result.scoreEarned).toBeGreaterThan(0);
      expect(gameService.scores.player1).toBeGreaterThan(0);
      expect(gameService.answeredUsers.has("player1")).toBe(true);
    });

    test("should process incorrect answer", () => {
      const result = gameService.processAnswer("player1", 1, 5);

      expect(result.success).toBe(true);
      expect(result.isCorrect).toBe(false);
      expect(result.scoreEarned).toBe(0);
      expect(gameService.scores.player1).toBeUndefined();
    });

    test("should not process answer when question is not active", () => {
      gameService.isQuestionActive = false;

      const result = gameService.processAnswer("player1", 0, 5);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("no_question");
    });

    test("should not process duplicate answer from same player", () => {
      gameService.answeredUsers.add("player1");

      const result = gameService.processAnswer("player1", 0, 5);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("already_answered");
    });

    test("should not process answer after time limit", () => {
      const result = gameService.processAnswer("player1", 0, 20); // Exceeds time limit (15s)

      expect(result.success).toBe(false);
      expect(result.reason).toBe("time_expired");
    });
  });

  describe("analytics", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
    });

    test("should track answer analytics", () => {
      gameService.processAnswer("player1", 0, 5);
      gameService.processAnswer("player2", 1, 3);
      gameService.processAnswer("player3", 0, 4);

      const analytics = gameService.getAnalytics();

      expect(analytics.totalAnswers).toBe(3);
      expect(analytics.correctAnswers).toBe(2);
      expect(analytics.responseTimeDistribution).toHaveLength(3);
      expect(analytics.questionStats[0].totalAnswers).toBe(3);
      expect(analytics.questionStats[0].correctAnswers).toBe(2);
    });

    test("should get question analytics", () => {
      gameService.processAnswer("player1", 0, 5);
      gameService.processAnswer("player2", 1, 3);

      const questionAnalytics = gameService.getQuestionAnalytics(0);

      expect(questionAnalytics.totalAnswers).toBe(2);
      expect(questionAnalytics.correctAnswers).toBe(1);
      expect(questionAnalytics.responseTimes).toHaveLength(2);
    });

    test("should export results to CSV", () => {
      gameService.scores = {
        player1: 80,
        player2: 60,
        player3: 40,
      };

      const csv = gameService.exportResultsToCSV();

      expect(csv).toContain("player1");
      expect(csv).toContain("player2");
      expect(csv).toContain("player3");
      expect(csv).toContain("80");
      expect(csv).toContain("60");
      expect(csv).toContain("40");
    });
  });

  describe("game state", () => {
    test("should check if question is active", () => {
      gameService.isQuestionActive = true;
      expect(gameService.isCurrentQuestionActive()).toBe(true);

      gameService.isQuestionActive = false;
      expect(gameService.isCurrentQuestionActive()).toBe(false);
    });

    test("should get current question index", () => {
      gameService.currentQuestionIndex = 5;
      expect(gameService.getCurrentQuestionIndex()).toBe(5);
    });

    test("should get total questions", () => {
      gameService.quizData = mockQuizData;
      expect(gameService.getTotalQuestions()).toBe(2);
    });

    test("should check if quiz is finished", () => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 1;
      gameService.isQuestionActive = false;

      expect(gameService.isQuizFinished()).toBe(true);

      gameService.isQuestionActive = true;
      expect(gameService.isQuizFinished()).toBe(false);
    });

    test("should reset game", () => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 1;
      gameService.scores = { player1: 100 };
      gameService.isQuestionActive = true;

      gameService.resetGame();

      expect(gameService.quizData).toEqual([]);
      expect(gameService.currentQuestionIndex).toBe(-1);
      expect(gameService.scores).toEqual({});
      expect(gameService.isQuestionActive).toBe(false);
      expect(gameService.answerAnalytics.totalAnswers).toBe(0);
    });
  });

  describe("getAllPlayersScores", () => {
    test("should return all player scores", () => {
      gameService.scores = {
        player1: 100,
        player2: 80,
        player3: 60,
      };

      const scores = gameService.getAllPlayersScores();

      expect(scores).toEqual({
        player1: 100,
        player2: 80,
        player3: 60,
      });
    });

    test("should return empty object when no scores", () => {
      const scores = gameService.getAllPlayersScores();

      expect(scores).toEqual({});
    });
  });

  describe("pause/resume functionality", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
    });

    test("should pause game when togglePause called", () => {
      const result = gameService.togglePause();

      expect(result).toBe(true);
      expect(gameService.isPaused).toBe(true);
      expect(gameService.pauseStartTime).toBeGreaterThan(0);
    });

    test("should resume game when togglePause called again", async () => {
      gameService.togglePause(); // Pause

      // Wait a bit to ensure some paused time
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = gameService.togglePause(); // Resume

      expect(result).toBe(false);
      expect(gameService.isPaused).toBe(false);
      expect(gameService.totalPausedTime).toBeGreaterThanOrEqual(0);
    });

    test("should not toggle pause when question is not active", () => {
      gameService.isQuestionActive = false;

      const result = gameService.togglePause();

      expect(result).toBe(false);
      expect(gameService.isPaused).toBe(false);
    });

    test("should check if game is paused", () => {
      expect(gameService.isGamePaused()).toBe(false);

      gameService.togglePause();
      expect(gameService.isGamePaused()).toBe(true);
    });
  });

  describe("getRemainingTime", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
      gameService.questionStartTime = Date.now() - 5000; // 5 seconds ago
    });

    test("should return remaining time for active question", () => {
      const remainingTime = gameService.getRemainingTime();

      expect(remainingTime).toBeGreaterThan(0);
      expect(remainingTime).toBeLessThanOrEqual(15);
    });

    test("should return 0 when question is not active", () => {
      gameService.isQuestionActive = false;

      const remainingTime = gameService.getRemainingTime();

      expect(remainingTime).toBe(0);
    });

    test("should use custom time limit", () => {
      gameService.customTimeLimit = 30;
      gameService.questionStartTime = Date.now() - 10000; // 10 seconds ago

      const remainingTime = gameService.getRemainingTime();

      expect(remainingTime).toBeGreaterThan(15);
      expect(remainingTime).toBeLessThanOrEqual(30);
    });
  });

  describe("loadQuiz with custom time limit", () => {
    test("should store custom time limit", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => arr);

      const result = gameService.loadQuiz("test.txt", false, null, 30);

      expect(result.success).toBe(true);
      expect(result.timeLimit).toBe(30);
      expect(gameService.customTimeLimit).toBe(30);
    });

    test("should use default time limit when not specified", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => arr);

      const result = gameService.loadQuiz("test.txt", false, null, null);

      expect(result.success).toBe(true);
      expect(result.timeLimit).toBe(15); // Default from config
    });
  });

  describe("getNextQuestion with question image", () => {
    test("should include question image in response", () => {
      const quizWithImage = [
        {
          question: "Question with image?",
          questionImg: "/media/test.jpg",
          options: [{ text: "Option 1", img: null }],
          correct: 0,
        },
      ];
      gameService.quizData = quizWithImage;

      const question = gameService.getNextQuestion();

      expect(question.questionImg).toBe("/media/test.jpg");
    });
  });

  describe("getQuestionAnalytics edge cases", () => {
    test("should return default data for non-existent question index", () => {
      const analytics = gameService.getQuestionAnalytics(999);

      expect(analytics).toEqual({
        question: "Нет данных",
        totalAnswers: 0,
        correctAnswers: 0,
        averageResponseTime: 0,
        responseTimes: [],
      });
    });

    test("should return last question analytics when index is -1", () => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
      gameService.processAnswer("player1", 0, 5);

      const analytics = gameService.getQuestionAnalytics(-1);

      expect(analytics.totalAnswers).toBe(1);
      expect(analytics.correctAnswers).toBe(1);
    });

    test("should return default data when no questions answered", () => {
      const analytics = gameService.getQuestionAnalytics(-1);

      expect(analytics).toEqual({
        question: "Нет данных",
        totalAnswers: 0,
        correctAnswers: 0,
        averageResponseTime: 0,
        responseTimes: [],
      });
    });
  });

  describe("exportResults", () => {
    test("should export to CSV by default", () => {
      gameService.scores = { player1: 100 };

      const result = gameService.exportResults();

      expect(typeof result).toBe("string");
      expect(result).toContain("player1");
    });

    test("should export to CSV when format is csv", () => {
      gameService.scores = { player1: 100 };

      const result = gameService.exportResults("csv");

      expect(typeof result).toBe("string");
      expect(result).toContain("player1");
    });

    test("should export to XLSX when format is xlsx", () => {
      gameService.scores = { player1: 100 };

      const result = gameService.exportResults("xlsx");

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("processAnswer edge cases", () => {
    beforeEach(() => {
      gameService.quizData = mockQuizData;
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;
      gameService.questionStartTime = Date.now() - 10000; // 10 seconds ago
    });

    test("should not process answer when no current question", () => {
      gameService.quizData = [];
      gameService.currentQuestionIndex = 0;
      gameService.isQuestionActive = true;

      const result = gameService.processAnswer("player1", 0, 5);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("no_question");
    });

    test("should use custom time limit for answer validation", () => {
      gameService.customTimeLimit = 30;

      // Answer within custom time limit (20s < 30s)
      const result = gameService.processAnswer("player1", 0, 20);

      expect(result.success).toBe(true);
    });
  });

  describe("loadQuiz with questionCount 'Все'", () => {
    test("should not limit questions when questionCount is 'Все'", () => {
      loadQuizFile.mockReturnValue(mockQuizData);
      shuffleArray.mockImplementation((arr) => arr);

      const result = gameService.loadQuiz("test.txt", false, "Все");

      expect(result.success).toBe(true);
      expect(result.questionCount).toBe(2);
      expect(gameService.quizData).toHaveLength(2);
    });
  });
});
