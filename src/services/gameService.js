const { loadQuizFile, shuffleArray } = require("../utils/quizParser");

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
   * @returns {Object} результат загрузки
   */
  loadQuiz(fileName, shuffle = false, questionCount = null) {
    try {
      let loadedData = loadQuizFile(fileName);

      if (shuffle) {
        loadedData = shuffleArray(loadedData);
      }

      // Если задано ограничение на количество вопросов — обрезаем массив
      if (
        typeof questionCount === "number" &&
        questionCount > 0 &&
        questionCount < loadedData.length
      ) {
        loadedData = loadedData.slice(0, questionCount);
      }

      this.quizData = loadedData;
      this.currentQuestionIndex = -1;
      this.scores = {};

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
        message: `Загружен квиз: ${fileName}, перемешан: ${shuffle}, вопросов: ${loadedData.length}`,
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
    if (
      !this.isQuestionActive &&
      this.currentQuestionIndex < this.quizData.length - 1
    ) {
      this.currentQuestionIndex++;
      this.isQuestionActive = true;
      this.votes = {};
      this.answeredUsers.clear();
      this.questionStartTime = Date.now();

      const question = this.quizData[this.currentQuestionIndex];
      return {
        question: question.question,
        questionImg: question.questionImg,
        options: question.options,
        timeLeft: 15, // TIME_LIMIT
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
    return (
      this.currentQuestionIndex >= this.quizData.length - 1 &&
      !this.isQuestionActive
    );
  }

  /**
   * Сбрасывает игру
   */
  resetGame() {
    this.currentQuestionIndex = -1;
    this.scores = {};
    this.quizData = [];
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
    if (!currentQ) {
      return { success: false, reason: "no_question" };
    }

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

    const questionStat =
      this.answerAnalytics.questionStats[this.currentQuestionIndex];
    questionStat.totalAnswers++;
    questionStat.responseTimes.push(timeElapsed);

    if (isCorrect) {
      questionStat.correctAnswers++;
    }

    // Обновляем среднее время ответа для вопроса
    questionStat.averageResponseTime =
      questionStat.responseTimes.reduce((a, b) => a + b, 0) /
      questionStat.responseTimes.length;

    // Обновляем общее среднее время ответа
    this.answerAnalytics.averageResponseTime =
      this.answerAnalytics.responseTimeDistribution.reduce((a, b) => a + b, 0) /
      this.answerAnalytics.responseTimeDistribution.length;

    // Начисление очков
    if (isCorrect && nickname) {
      const MAX_SCORE = 100;
      const MIN_SCORE = 20;
      const TIME_LIMIT = 15;

      let scoreEarned = Math.round(
        MAX_SCORE - (timeElapsed * (MAX_SCORE - MIN_SCORE)) / TIME_LIMIT,
      );
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
        totalAnswers > 0
          ? ((correctAnswers / totalAnswers) * 100).toFixed(2)
          : "0.00";
      const avgResponseTime =
        this.answerAnalytics.averageResponseTime.toFixed(2);

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
    const questionHeaders = [
      "Вопрос",
      "Ответов",
      "Правильных",
      "Процент",
      "Среднее время (сек)",
    ];
    const questionRows = this.answerAnalytics.questionStats.map(
      (question, index) => {
        const accuracy =
          question.totalAnswers > 0
            ? ((question.correctAnswers / question.totalAnswers) * 100).toFixed(
                2,
              )
            : "0.00";
        const avgTime = question.averageResponseTime.toFixed(2);

        return [
          `"${question.question.replace(/"/g, '""')}"`,
          question.totalAnswers,
          question.correctAnswers,
          `${accuracy}%`,
          avgTime,
        ].join(",");
      },
    );

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
      ...this.answerAnalytics.responseTimeDistribution.map((time) =>
        time.toFixed(2),
      ),
    ].join("\n");

    return csv;
  }
}

module.exports = new GameService();
