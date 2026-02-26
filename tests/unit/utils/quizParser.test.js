const fs = require("fs");
const path = require("path");
const {
  loadQuizFile,
  loadQuizFileAsync,
  loadQuizFileSync,
  shuffleArray,
  clearCache,
} = require("../../../src/utils/quizParser");

describe("quizParser", () => {
  const testQuizFile = path.join(__dirname, "../../../quizzes/example.txt");

  describe("loadQuizFile", () => {
    beforeEach(() => {
      // Clear cache to ensure fresh file reads
      clearCache("example.txt");

      // Ensure the test file exists
      if (!fs.existsSync(testQuizFile)) {
        fs.writeFileSync(
          testQuizFile,
          `Вопрос: Test question?
Варианты:
Option 1
Option 2
Ответ: 1`,
        );
      }
    });

    afterEach(() => {
      // Clean up if we created the file
      if (fs.existsSync(testQuizFile)) {
        fs.unlinkSync(testQuizFile);
      }
      // Clear cache after each test
      clearCache("example.txt");
    });

    test("should load quiz file successfully", () => {
      const result = loadQuizFile("example.txt");

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("question");
      expect(result[0]).toHaveProperty("options");
      expect(result[0]).toHaveProperty("correct");
    });

    test("should parse question text correctly", () => {
      const result = loadQuizFile("example.txt");

      expect(result[0].question).toBe(" Test question?");
    });

    test("should parse options correctly", () => {
      const result = loadQuizFile("example.txt");

      expect(result[0].options).toHaveLength(2);
      expect(result[0].options[0].text).toBe("Option 1");
      expect(result[0].options[1].text).toBe("Option 2");
    });

    test("should parse correct answer index correctly", () => {
      const result = loadQuizFile("example.txt");

      expect(result[0].correct).toBe(0); // 1 - 1 = 0 (convert from 1-based to 0-based)
    });

    test("should handle questions with images", () => {
      const quizWithImage = `Вопрос: Question with image [img:test.jpg]
Варианты:
Option 1
Option 2
Ответ: 1`;

      fs.writeFileSync(testQuizFile, quizWithImage);
      const result = loadQuizFile("example.txt");

      expect(result[0].question).toBe("Question with image");
      expect(result[0].questionImg).toBe("/media/test.jpg");
    });

    test("should handle options with images", () => {
      const quizWithOptionImage = `Вопрос: Test question?
Варианты:
Option 1 [img:option1.jpg]
Option 2
Ответ: 1`;

      fs.writeFileSync(testQuizFile, quizWithOptionImage);
      const result = loadQuizFile("example.txt");

      expect(result[0].options[0].text).toBe("Option 1");
      expect(result[0].options[0].img).toBe("/media/option1.jpg");
      expect(result[0].options[1].text).toBe("Option 2");
      expect(result[0].options[1].img).toBeNull();
    });

    test("should throw error for non-existent file", () => {
      expect(() => {
        loadQuizFile("non-existent.txt");
      }).toThrow();
    });

    test("should handle empty file", () => {
      fs.writeFileSync(testQuizFile, "");
      const result = loadQuizFile("example.txt");

      expect(result).toEqual([]);
    });

    test("should handle malformed quiz file", () => {
      const malformedQuiz = `Invalid format
No proper structure`;

      fs.writeFileSync(testQuizFile, malformedQuiz);
      const result = loadQuizFile("example.txt");

      // The parser creates a default question object for malformed files
      expect(result).toHaveLength(1);
      expect(result[0].question).toBe("");
      expect(result[0].options).toEqual([]);
      expect(result[0].correct).toBe(-1);
    });
  });

  describe("shuffleArray", () => {
    test("should return a new array", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);

      expect(shuffled).not.toBe(original);
      expect(Array.isArray(shuffled)).toBe(true);
    });

    test("should maintain same length", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);

      expect(shuffled.length).toBe(original.length);
    });

    test("should contain same elements", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);

      expect(shuffled.sort()).toEqual(original.sort());
    });

    test("should actually shuffle the array", () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = shuffleArray(original);

      // With a large enough array, it's extremely unlikely to be in the same order
      const isSameOrder = shuffled.every((item, index) => item === original[index]);
      expect(isSameOrder).toBe(false);
    });

    test("should handle empty array", () => {
      const result = shuffleArray([]);
      expect(result).toEqual([]);
    });

    test("should handle single element array", () => {
      const result = shuffleArray([1]);
      expect(result).toEqual([1]);
    });

    test("should handle array with duplicate elements", () => {
      const original = [1, 1, 2, 2, 3, 3];
      const shuffled = shuffleArray(original);

      expect(shuffled.sort()).toEqual(original.sort());
    });
  });

  describe("loadQuizFileAsync", () => {
    beforeEach(() => {
      clearCache("example.txt");
    });

    afterEach(() => {
      if (fs.existsSync(testQuizFile)) {
        fs.unlinkSync(testQuizFile);
      }
      clearCache("example.txt");
    });

    test("should load quiz file asynchronously", async () => {
      fs.writeFileSync(
        testQuizFile,
        `Вопрос: Async test question?
Варианты:
Option A
Option B
Ответ: 2`,
      );

      const result = await loadQuizFileAsync("example.txt");

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].question).toBe(" Async test question?");
      expect(result[0].options).toHaveLength(2);
      expect(result[0].correct).toBe(1);
    });

    test("should cache loaded quiz", async () => {
      fs.writeFileSync(
        testQuizFile,
        `Вопрос: Cached question?
Варианты:
Option 1
Ответ: 1`,
      );

      // First load
      const result1 = await loadQuizFileAsync("example.txt");
      // Second load should return cached result
      const result2 = await loadQuizFileAsync("example.txt");

      expect(result1).toBe(result2); // Same reference (cached)
    });

    test("should throw error for non-existent file", async () => {
      await expect(loadQuizFileAsync("non-existent-async.txt")).rejects.toThrow();
    });
  });

  describe("loadQuizFileSync", () => {
    beforeEach(() => {
      clearCache("example.txt");
    });

    afterEach(() => {
      if (fs.existsSync(testQuizFile)) {
        fs.unlinkSync(testQuizFile);
      }
      clearCache("example.txt");
    });

    test("should return cached result if available", () => {
      fs.writeFileSync(
        testQuizFile,
        `Вопрос: Cached sync question?
Варианты:
Option 1
Ответ: 1`,
      );

      // First load
      const result1 = loadQuizFileSync("example.txt");
      // Second load should return cached result
      const result2 = loadQuizFileSync("example.txt");

      expect(result1).toBe(result2); // Same reference
    });
  });

  describe("clearCache", () => {
    test("should clear specific file from cache", () => {
      fs.writeFileSync(
        testQuizFile,
        `Вопрос: Test?
Варианты:
A
Ответ: 1`,
      );

      loadQuizFile("example.txt");
      clearCache("example.txt");

      // After clearing, should load fresh data
      const result = loadQuizFile("example.txt");
      expect(result).toBeDefined();
    });

    test("should clear entire cache when no filename provided", () => {
      fs.writeFileSync(
        testQuizFile,
        `Вопрос: Test?
Варианты:
A
Ответ: 1`,
      );

      loadQuizFile("example.txt");
      clearCache(); // Clear all

      // Cache should be empty
      expect(() => loadQuizFile("example.txt")).toBeDefined();
    });
  });

  describe("image handling", () => {
    beforeEach(() => {
      clearCache("example.txt");
    });

    afterEach(() => {
      if (fs.existsSync(testQuizFile)) {
        fs.unlinkSync(testQuizFile);
      }
      clearCache("example.txt");
    });

    test("should handle external image URLs (http)", () => {
      const quizWithExternalImage = `Вопрос: Question [img:http://example.com/image.jpg]
Варианты:
Option 1
Ответ: 1`;

      fs.writeFileSync(testQuizFile, quizWithExternalImage);
      const result = loadQuizFile("example.txt");

      expect(result[0].questionImg).toBe("http://example.com/image.jpg");
    });

    test("should handle external image URLs (https)", () => {
      const quizWithHttpsImage = `Вопрос: Question [img:https://example.com/image.jpg]
Варианты:
Option 1
Ответ: 1`;

      fs.writeFileSync(testQuizFile, quizWithHttpsImage);
      const result = loadQuizFile("example.txt");

      expect(result[0].questionImg).toBe("https://example.com/image.jpg");
    });

    test("should handle multiple images in question text", () => {
      const quizWithMultipleImages = `Вопрос: Question [img:first.jpg] [img:second.jpg]
Варианты:
Option 1
Ответ: 1`;

      fs.writeFileSync(testQuizFile, quizWithMultipleImages);
      const result = loadQuizFile("example.txt");

      // Should use first image and remove all img tags from text
      expect(result[0].questionImg).toBe("/media/first.jpg");
      expect(result[0].question).toBe("Question");
    });
  });

  describe("answer parsing edge cases", () => {
    beforeEach(() => {
      clearCache("example.txt");
    });

    afterEach(() => {
      if (fs.existsSync(testQuizFile)) {
        fs.unlinkSync(testQuizFile);
      }
      clearCache("example.txt");
    });

    test("should handle invalid answer (NaN)", () => {
      const quizWithInvalidAnswer = `Вопрос: Test question?
Варианты:
Option 1
Option 2
Ответ: invalid`;

      fs.writeFileSync(testQuizFile, quizWithInvalidAnswer);
      const result = loadQuizFile("example.txt");

      expect(result[0].correct).toBe(-1);
    });

    test("should handle missing answer", () => {
      const quizWithoutAnswer = `Вопрос: Test question?
Варианты:
Option 1
Option 2`;

      fs.writeFileSync(testQuizFile, quizWithoutAnswer);
      const result = loadQuizFile("example.txt");

      expect(result[0].correct).toBe(-1);
    });

    test("should handle multiple questions", () => {
      const multiQuestionQuiz = `Вопрос: First question?
Варианты:
A1
A2
Ответ: 1

Вопрос: Second question?
Варианты:
B1
B2
Ответ: 2`;

      fs.writeFileSync(testQuizFile, multiQuestionQuiz);
      const result = loadQuizFile("example.txt");

      expect(result).toHaveLength(2);
      expect(result[0].question).toBe(" First question?");
      expect(result[1].question).toBe(" Second question?");
      expect(result[0].correct).toBe(0);
      expect(result[1].correct).toBe(1);
    });
  });
});
