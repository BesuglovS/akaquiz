const gameService = require("../../../src/services/gameService");

describe("GameService Export", () => {
  beforeEach(() => {
    gameService.resetGame();
  });

  describe("exportResults", () => {
    it("should export results in CSV format by default", () => {
      // Подготавливаем данные для теста
      gameService.scores = {
        "player1": 100,
        "player2": 80
      };
      
      gameService.answerAnalytics = {
        totalAnswers: 5,
        correctAnswers: 3,
        averageResponseTime: 15.5,
        responseTimeDistribution: [10.2, 15.8, 20.1, 12.5, 18.9],
        questionStats: [
          {
            question: "Test question 1",
            totalAnswers: 2,
            correctAnswers: 1,
            averageResponseTime: 12.5,
            responseTimes: [10.2, 14.8]
          }
        ]
      };

      const result = gameService.exportResults();
      
      expect(typeof result).toBe("string");
      expect(result).toContain("=== ОБЩАЯ СТАТИСТИКА ===");
      expect(result).toContain("player1");
      expect(result).toContain("player2");
      expect(result).toContain("=== СТАТИСТИКА ПО ВОПРОСАМ ===");
      expect(result).toContain("Test question 1");
    });

    it("should export results in CSV format when explicitly requested", () => {
      const result = gameService.exportResults("csv");
      
      expect(typeof result).toBe("string");
      expect(result).toContain("=== ОБЩАЯ СТАТИСТИКА ===");
    });

    it("should export results in Excel format", () => {
      // Подготавливаем данные для теста
      gameService.scores = {
        "player1": 100,
        "player2": 80
      };
      
      gameService.answerAnalytics = {
        totalAnswers: 5,
        correctAnswers: 3,
        averageResponseTime: 15.5,
        responseTimeDistribution: [10.2, 15.8, 20.1, 12.5, 18.9],
        questionStats: [
          {
            question: "Test question 1",
            totalAnswers: 2,
            correctAnswers: 1,
            averageResponseTime: 12.5,
            responseTimes: [10.2, 14.8]
          }
        ]
      };

      const result = gameService.exportResults("xlsx");
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle empty data for export", () => {
      const csvResult = gameService.exportResults("csv");
      expect(typeof csvResult).toBe("string");
      expect(csvResult).toContain("=== ОБЩАЯ СТАТИСТИКА ===");

      const xlsxResult = gameService.exportResults("xlsx");
      expect(Buffer.isBuffer(xlsxResult)).toBe(true);
    });
  });
});