const gameService = require("../../../src/services/gameService");
const { loadQuizFile } = require("../../../src/utils/quizParser");

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

      const result = gameService.loadQuiz("test.txt", true, null);

      expect(result.success).toBe(true);
      expect(result.shuffle).toBe(true);
      expect(gameService.quizData).toHaveLength(2);
    });

    test("should limit questions when questionCount is specified", () => {
      loadQuizFile.mockReturnValue(mockQuizData);

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
      const result = gameService.processAnswer("player1", 0, 20); // Exceeds time limit

      expect(result.success).toBe(false);
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
});
