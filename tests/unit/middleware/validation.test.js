const {
  validateHostPassword,
  validateNickname,
  validateAnswerIndex,
  validateQuizSelection,
  validateResponseTime,
} = require("../../../src/middleware/validation");

describe("validation middleware", () => {
  describe("validateHostPassword", () => {
    test("should validate valid password", () => {
      const result = validateHostPassword("validPassword");

      expect(result.isValid).toBe(true);
    });

    test("should reject empty password", () => {
      const result = validateHostPassword("");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Пароль должен быть строкой");
    });

    test("should reject null password", () => {
      const result = validateHostPassword(null);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Пароль должен быть строкой");
    });

    test("should reject non-string password", () => {
      const result = validateHostPassword(123);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть строкой");
    });

    test("should reject whitespace-only password", () => {
      const result = validateHostPassword("   ");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Пароль не может быть пустым");
    });
  });

  describe("validateNickname", () => {
    test("should validate valid nickname", () => {
      const result = validateNickname("validNickname");

      expect(result.isValid).toBe(true);
      expect(result.value).toBe("validNickname");
    });

    test("should trim whitespace from nickname", () => {
      const result = validateNickname("  trimmedName  ");

      expect(result.isValid).toBe(true);
      expect(result.value).toBe("trimmedName");
    });

    test("should reject empty nickname", () => {
      const result = validateNickname("");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Никнейм должен быть строкой");
    });

    test("should reject nickname that is too long", () => {
      const longName = "a".repeat(21); // Exceeds max length of 20
      const result = validateNickname(longName);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("длиннее 20 символов");
    });

    test("should reject nickname with invalid characters", () => {
      const result = validateNickname("invalid@name");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("недопустимые символы");
    });

    test("should accept nickname with allowed special characters", () => {
      const result = validateNickname("valid-name_123");

      expect(result.isValid).toBe(true);
      expect(result.value).toBe("valid-name_123");
    });

    test("should reject non-string nickname", () => {
      const result = validateNickname(123);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть строкой");
    });
  });

  describe("validateAnswerIndex", () => {
    test("should validate valid answer index", () => {
      const result = validateAnswerIndex(1, 3);

      expect(result.isValid).toBe(true);
    });

    test("should reject negative index", () => {
      const result = validateAnswerIndex(-1, 3);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть от 0 до 2");
    });

    test("should reject index that is too high", () => {
      const result = validateAnswerIndex(3, 3);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть от 0 до 2");
    });

    test("should reject non-integer index", () => {
      const result = validateAnswerIndex(1.5, 3);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть целым числом");
    });

    test("should reject non-numeric index", () => {
      const result = validateAnswerIndex("1", 3);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть целым числом");
    });
  });

  describe("validateQuizSelection", () => {
    test("should validate valid quiz selection", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        questionCount: 10,
      });

      expect(result.isValid).toBe(true);
    });

    test("should validate quiz selection without questionCount", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: false,
      });

      expect(result.isValid).toBe(true);
    });

    test("should reject missing fileName", () => {
      const result = validateQuizSelection({
        shuffle: true,
        questionCount: 10,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("обязательно");
    });

    test("should reject non-string fileName", () => {
      const validation = validateQuizSelection({
        fileName: 123,
        shuffle: false,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Имя файла квиза обязательно");
    });

    test("should reject fileName without .txt extension", () => {
      const result = validateQuizSelection({
        fileName: "test.json",
        shuffle: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен иметь расширение .txt");
    });

    test("should reject non-boolean shuffle", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: "yes",
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должен быть булевым значением");
    });

    test("should reject negative questionCount", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        questionCount: -1,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должно быть больше 0");
    });

    test("should reject non-integer questionCount", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        questionCount: 10.5,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должно быть целым числом");
    });

    test("should accept questionCount as 'Все'", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        questionCount: "Все",
      });

      expect(result.isValid).toBe(true);
    });

    test("should validate valid timeLimit", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        timeLimit: 30,
      });

      expect(result.isValid).toBe(true);
    });

    test("should reject timeLimit below minimum", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        timeLimit: 3,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Время ответа должно быть от 5 до 300 секунд");
    });

    test("should reject timeLimit above maximum", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        timeLimit: 400,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Время ответа должно быть от 5 до 300 секунд");
    });

    test("should reject non-integer timeLimit", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        timeLimit: 30.5,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Время ответа должно быть целым числом");
    });

    test("should accept null timeLimit", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        timeLimit: null,
      });

      expect(result.isValid).toBe(true);
    });

    test("should accept null questionCount", () => {
      const result = validateQuizSelection({
        fileName: "test.txt",
        shuffle: true,
        questionCount: null,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe("validateResponseTime", () => {
    test("should validate valid response time", () => {
      const result = validateResponseTime(5.5);

      expect(result.isValid).toBe(true);
    });

    test("should validate zero response time", () => {
      const result = validateResponseTime(0);

      expect(result.isValid).toBe(true);
    });

    test("should reject negative response time", () => {
      const result = validateResponseTime(-1);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("неотрицательным числом");
    });

    test("should reject non-numeric response time", () => {
      const result = validateResponseTime("5");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("должно быть неотрицательным числом");
    });

    test("should reject response time that exceeds limit", () => {
      const result = validateResponseTime(100); // Exceeds 4 * 15 = 60

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("не может быть больше 60 секунд");
    });
  });
});
