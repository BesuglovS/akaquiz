const { loadQuizFile, shuffleArray } = require("../utils/quizParser");
const config = require("../../config");

/**
 * Сервис для управления игровыми данными и состоянием
 */
class GameService {
  constructor() {
    this.quizData = [];
    this.currentQuestionIndex = -1;
    this.votes = {};
    this.scores = {};
    this.answeredUsers = new Set();
    this.isQuestionActive = false;
    this.questionStartTime = 0;
    this.customTimeLimit = null; // Кастомное время ответа
    this.isPaused = false;
    this.pauseStartTime = 0;
    this.totalPausedTime = 0;

    // Аналитика
    this.answerAnalytics = {
      totalAnswers: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      responseTimeDistribution: [],
      questionStats: [],
    };
  }

  /**
   * Загружает квиз из файла
   * @param {string} fileName - имя файла
   * @param {boolean} shuffle - перемешивать ли вопросы
   * @param {number|null} questionCount - количество вопросов
   * @param {number|null} timeLimit - время ответа на вопрос
   * @returns {Object} результат загрузки
   */
  loadQuiz(fileName, shuffle = false, questionCount = null, timeLimit = null) {
    try {
      let loadedData = loadQuizFile(fileName);

      // Сохраняем оригинальный порядок для проверки перемешивания
      const originalData = [...loadedData];

      if (shuffle) {
        loadedData = shuffleArray(loadedData);
      }

      // Если задано ограничение на количество вопросов — обрезаем массив
      if (
        questionCount !== "Все" &&
        typeof questionCount === "number" &&
        questionCount > 0 &&
        questionCount < loadedData.length
      ) {
        loadedData = loadedData.slice(0, questionCount);
      }

      this.quizData = loadedData;
      this.currentQuestionIndex = -1;
      this.scores = {};
      this.customTimeLimit = timeLimit; // Сохраняем кастомное время

      // Сброс аналитики при загрузке нового квиза
      this.answerAnalytics = {
        totalAnswers: 0,
        correctAnswers: 0,
        averageResponseTime: 0,
        responseTimeDistribution: [],
        questionStats: [],
      };

      return {
        success: true,
        fileName,
        shuffle,
        questionCount: loadedData.length,
        timeLimit: timeLimit || config.game.timeLimit,
        message: `Загружен квиз: ${fileName}, перемешан: ${shuffle}, вопросов: ${loadedData.length}, время: ${timeLimit || config.game.timeLimit}с`,
      };
    } catch (error) {
      console.error("Ошибка загрузки квиза:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Получает следующий вопрос
   * @returns {Object|null} вопрос или null если вопросы закончились
   */
  getNextQuestion() {
    if (!this.isQuestionActive && this.currentQuestionIndex < this.quizData.length - 1) {
      this.currentQuestionIndex++;
      this.isQuestionActive = true;
      this.votes = {};
      this.answeredUsers.clear();
      this.questionStartTime = Date.now();

      const question = this.quizData[this.currentQuestionIndex];
      const timeLimit = this.customTimeLimit || config.game.timeLimit;

      return {
        question: question.question,
        questionImg: question.questionImg,
        options: question.options,
        timeLeft: timeLimit,
        questionNumber: this.currentQuestionIndex + 1,
        totalQuestions: this.quizData.length,
      };
    }
    return null;
  }

  /**
   * Завершает текущий вопрос
   * @returns {Object} результат завершения
   */
  endCurrentQuestion() {
    if (!this.isQuestionActive) {
      return null;
    }

    this.isQuestionActive = false;
    const correctIndex = this.quizData[this.currentQuestionIndex].correct;

    return {
      correctAnswer: correctIndex,
      currentOptions: this.quizData[this.currentQuestionIndex].options,
      votes: this.votes,
    };
  }

  /**
   * Проверяет, активен ли текущий вопрос
   * @returns {boolean}
   */
  isCurrentQuestionActive() {
    return this.isQuestionActive;
  }

  /**
   * Получает индекс текущего вопроса
   * @returns {number}
   */
  getCurrentQuestionIndex() {
    return this.currentQuestionIndex;
  }

  /**
   * Получает общее количество вопросов
   * @returns {number}
   */
  getTotalQuestions() {
    return this.quizData.length;
  }

  /**
   * Проверяет, закончились ли вопросы
   * @returns {boolean}
   */
  isQuizFinished() {
    return this.currentQuestionIndex >= this.quizData.length - 1 && !this.isQuestionActive;
  }

  /**
   * Сбрасывает игру
   */
  resetGame() {
    this.currentQuestionIndex = -1;
    this.scores = {};
    this.quizData = [];
    this.isQuestionActive = false;
    this.answerAnalytics = {
      totalAnswers: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      responseTimeDistribution: [],
      questionStats: [],
    };
  }

  /**
   * Обрабатывает ответ игрока
   * @param {string} nickname - ник игрока
   * @param {number} answerIndex - индекс выбранного ответа
   * @param {number} timeElapsed - время ответа в секундах
   * @returns {Object} результат обработки ответа
   */
  processAnswer(nickname, answerIndex, timeElapsed) {
    const currentQ = this.quizData[this.currentQuestionIndex];

    // Проверяем, есть ли текущий вопрос
    if (!currentQ) {
      return { success: false, reason: "no_question" };
    }

    // Проверяем, активен ли вопрос
    if (!this.isQuestionActive) {
      return { success: false, reason: "no_question" };
    }

    // Проверяем, уже ли ответил пользователь
    if (this.answeredUsers.has(nickname)) {
      return { success: false, reason: "already_answered" };
    }

    // --- СБОР АНАЛИТИКИ ОТВЕТОВ ---
    this.answerAnalytics.totalAnswers++;
    this.answerAnalytics.responseTimeDistribution.push(timeElapsed);

    const isCorrect = answerIndex === currentQ.correct;
    if (isCorrect) {
      this.answerAnalytics.correctAnswers++;
    }

    // Статистика по текущему вопросу
    if (!this.answerAnalytics.questionStats[this.currentQuestionIndex]) {
      this.answerAnalytics.questionStats[this.currentQuestionIndex] = {
        question: currentQ.question,
        correctAnswers: 0,
        totalAnswers: 0,
        averageResponseTime: 0,
        responseTimes: [],
      };
    }

    const questionStat = this.answerAnalytics.questionStats[this.currentQuestionIndex];
    questionStat.totalAnswers++;
    questionStat.responseTimes.push(timeElapsed);

    if (isCorrect) {
      questionStat.correctAnswers++;
    }

    // Обновляем среднее время ответа для вопроса
    questionStat.averageResponseTime =
      questionStat.responseTimes.reduce((a, b) => a + b, 0) / questionStat.responseTimes.length;

    // Обновляем общее среднее время ответа
    this.answerAnalytics.averageResponseTime =
      this.answerAnalytics.responseTimeDistribution.reduce((a, b) => a + b, 0) /
      this.answerAnalytics.responseTimeDistribution.length;

    // Начисление очков
    let scoreEarned = 0;
    if (isCorrect && nickname) {
      const MAX_SCORE = config.game.scoring.maxScore;
      const MIN_SCORE = config.game.scoring.minScore;
      const TIME_LIMIT = this.customTimeLimit || config.game.timeLimit;

      scoreEarned = Math.round(MAX_SCORE - (timeElapsed * (MAX_SCORE - MIN_SCORE)) / TIME_LIMIT);
      scoreEarned = Math.max(MIN_SCORE, Math.min(MAX_SCORE, scoreEarned));
      this.scores[nickname] = (this.scores[nickname] || 0) + scoreEarned;
    }

    this.answeredUsers.add(nickname);
    if (!this.votes[answerIndex]) this.votes[answerIndex] = 0;
    this.votes[answerIndex]++;

    return {
      success: true,
      isCorrect,
      scoreEarned: isCorrect ? scoreEarned : 0,
      totalAnswers: this.answerAnalytics.totalAnswers,
      correctAnswers: this.answerAnalytics.correctAnswers,
    };
  }

  /**
   * Получает текущие очки всех игроков
   * @returns {Object} объект с очками игроков
   */
  getAllPlayersScores() {
    return { ...this.scores };
  }

  /**
   * Получает аналитику ответов
   * @returns {Object} данные аналитики
   */
  getAnalytics() {
    return { ...this.answerAnalytics };
  }

  /**
   * Получает аналитику по конкретному вопросу
   * @param {number} questionIndex - индекс вопроса
   * @returns {Object} аналитика по вопросу
   */
  getQuestionAnalytics(questionIndex) {
    if (questionIndex === -1) {
      const lastQuestionIndex = this.answerAnalytics.questionStats.length - 1;
      return (
        this.answerAnalytics.questionStats[lastQuestionIndex] || {
          question: "Нет данных",
          totalAnswers: 0,
          correctAnswers: 0,
          averageResponseTime: 0,
          responseTimes: [],
        }
      );
    }

    return (
      this.answerAnalytics.questionStats[questionIndex] || {
        question: "Нет данных",
        totalAnswers: 0,
        correctAnswers: 0,
        averageResponseTime: 0,
        responseTimes: [],
      }
    );
  }

  /**
   * Переключает паузу игры
   * @returns {boolean} true если игра на паузе, false если продолжена
   */
  togglePause() {
    if (!this.isQuestionActive) {
      return false;
    }

    if (this.isPaused) {
      // Продолжаем игру - вычисляем время паузы
      const pauseDuration = Date.now() - this.pauseStartTime;
      this.totalPausedTime += pauseDuration;
      this.isPaused = false;
      return false;
    } else {
      // Ставим на паузу
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      return true;
    }
  }

  /**
   * Получает оставшееся время для текущего вопроса
   * @returns {number} оставшееся время в секундах
   */
  getRemainingTime() {
    if (!this.isQuestionActive) {
      return 0;
    }

    const timeLimit = this.customTimeLimit || config.game.timeLimit;
    const elapsed = (Date.now() - this.questionStartTime - this.totalPausedTime) / 1000;
    return Math.max(0, Math.ceil(timeLimit - elapsed));
  }

  /**
   * Проверяет, на паузе ли игра
   * @returns {boolean}
   */
  isGamePaused() {
    return this.isPaused;
  }

  /**
   * Экспортирует результаты в выбранном формате
   * @param {string} format - формат экспорта: 'csv' или 'xlsx'
   * @returns {string|Buffer} CSV строка или Excel буфер
   */
  exportResults(format = "csv") {
    if (format === "xlsx") {
      return this.exportResultsToExcel();
    }
    return this.exportResultsToCSV();
  }

  /**
   * Экспортирует результаты в CSV формате
   * @returns {string} CSV строка
   */
  exportResultsToCSV() {
    const headers = [
      "Никнейм",
      "Очки",
      "Всего ответов",
      "Правильных ответов",
      "Процент правильных",
      "Среднее время ответа (сек)",
    ];

    const allScores = this.getAllPlayersScores();
    const players = Object.keys(allScores);

    // Формируем строки для CSV
    const rows = players.map((nickname) => {
      const totalAnswers = this.answerAnalytics.responseTimeDistribution.length;
      const correctAnswers = this.answerAnalytics.correctAnswers;
      const accuracy =
        totalAnswers > 0 ? ((correctAnswers / totalAnswers) * 100).toFixed(2) : "0.00";
      const avgResponseTime = this.answerAnalytics.averageResponseTime.toFixed(2);

      return [
        `"${nickname}"`,
        allScores[nickname],
        totalAnswers,
        correctAnswers,
        `${accuracy}%`,
        avgResponseTime,
      ].join(",");
    });

    // Добавляем строки по вопросам
    const questionHeaders = ["Вопрос", "Ответов", "Правильных", "Процент", "Среднее время (сек)"];
    const questionRows = this.answerAnalytics.questionStats.map((question, index) => {
      const accuracy =
        question.totalAnswers > 0
          ? ((question.correctAnswers / question.totalAnswers) * 100).toFixed(2)
          : "0.00";
      const avgTime = question.averageResponseTime.toFixed(2);

      return [
        `"${question.question.replace(/"/g, '""')}"`,
        question.totalAnswers,
        question.correctAnswers,
        `${accuracy}%`,
        avgTime,
      ].join(",");
    });

    // Формируем итоговый CSV
    const csv = [
      "=== ОБЩАЯ СТАТИСТИКА ===",
      headers.join(","),
      ...rows,
      "",
      "=== СТАТИСТИКА ПО ВОПРОСАМ ===",
      questionHeaders.join(","),
      ...questionRows,
      "",
      "=== ДЕТАЛИ ПО ВРЕМЕНИ ОТВЕТОВ ===",
      "Время ответа (сек)",
      ...this.answerAnalytics.responseTimeDistribution.map((time) => time.toFixed(2)),
    ].join("\n");

    return csv;
  }

  /**
   * Экспортирует результаты в Excel формате
   * @returns {Buffer} Excel файл в виде буфера
   */
  exportResultsToExcel() {
    const XLSX = require("xlsx");

    // Создаем новую рабочую книгу
    const workbook = XLSX.utils.book_new();

    // 1. Общая статистика
    const headers = [
      "Никнейм",
      "Очки",
      "Всего ответов",
      "Правильных ответов",
      "Процент правильных",
      "Среднее время ответа (сек)",
    ];

    const allScores = this.getAllPlayersScores();
    const players = Object.keys(allScores);

    const rows = players.map((nickname) => {
      const totalAnswers = this.answerAnalytics.responseTimeDistribution.length;
      const correctAnswers = this.answerAnalytics.correctAnswers;
      const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;
      const avgResponseTime = this.answerAnalytics.averageResponseTime;

      return [
        nickname,
        allScores[nickname],
        totalAnswers,
        correctAnswers,
        accuracy,
        avgResponseTime,
      ];
    });

    const generalData = [headers, ...rows];
    const generalSheet = XLSX.utils.aoa_to_sheet(generalData);
    XLSX.utils.book_append_sheet(workbook, generalSheet, "Общая статистика");

    // 2. Статистика по вопросам
    const questionHeaders = ["Вопрос", "Ответов", "Правильных", "Процент", "Среднее время (сек)"];

    const questionRows = this.answerAnalytics.questionStats.map((question, index) => {
      const accuracy =
        question.totalAnswers > 0 ? (question.correctAnswers / question.totalAnswers) * 100 : 0;
      return [
        question.question,
        question.totalAnswers,
        question.correctAnswers,
        accuracy,
        question.averageResponseTime,
      ];
    });

    const questionData = [questionHeaders, ...questionRows];
    const questionSheet = XLSX.utils.aoa_to_sheet(questionData);
    XLSX.utils.book_append_sheet(workbook, questionSheet, "По вопросам");

    // 3. Детали по времени ответов
    const timeHeaders = ["Время ответа (сек)"];
    const timeRows = this.answerAnalytics.responseTimeDistribution.map((time) => [time]);
    const timeData = [timeHeaders, ...timeRows];
    const timeSheet = XLSX.utils.aoa_to_sheet(timeData);
    XLSX.utils.book_append_sheet(workbook, timeSheet, "Время ответов");

    // Генерируем буфер Excel файла
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return buffer;
  }
}

module.exports = new GameService();
