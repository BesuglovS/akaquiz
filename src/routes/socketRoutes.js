const {
  validateHostPassword,
  validateNickname,
  validateAnswerIndex,
  validateQuizSelection,
  validateResponseTime,
} = require("../middleware/validation");
const gameService = require("../services/gameService");
const {
  handleSocketError,
  validateOrThrow,
  asyncErrorHandler,
  initGlobalErrorHandlers,
} = require("../middleware/errorHandler");
const config = require("../../config");

/**
 * Запускает таймер вопроса
 * @param {Object} io - экземпляр Socket.IO
 * @param {Map} activeSockets - карта активных сокетов
 * @param {number} timeLimit - время на ответ в секундах
 * @returns {Object} объект с методами управления таймером
 */
function startQuestionTimer(io, activeSockets, timeLimit) {
  let timeLeft = timeLimit;
  let timerId = null;
  let isEnded = false;

  const endQuestion = () => {
    if (isEnded) return null;
    isEnded = true;
    if (timerId) clearInterval(timerId);
    return gameService.endCurrentQuestion();
  };

  timerId = setInterval(() => {
    timeLeft--;
    io.emit("timerTick", timeLeft);

    if (timeLeft <= 0) {
      clearInterval(timerId);
      const result = endQuestion();
      if (result) {
        const currentScores = gameService.getAllPlayersScores();
        io.emit("timeOver", {
          scores: currentScores,
          correctAnswer: result.correctAnswer,
          currentOptions: result.currentOptions,
        });
      }
    }
  }, 1000);

  return {
    getTimeLeft: () => timeLeft,
    endQuestion,
    clearTimer: () => {
      if (timerId) clearInterval(timerId);
    },
  };
}

/**
 * Сбрасывает флаги ответов для всех игроков
 * @param {Map} activeSockets - карта активных сокетов
 */
function resetAnswerFlags(activeSockets) {
  Array.from(activeSockets.values()).forEach((s) => {
    if (s.nickname) {
      s.answered = false;
    }
  });
}

/**
 * Обработчики Socket.IO событий
 * @param {Socket} io - экземпляр Socket.IO
 */
function setupSocketRoutes(io) {
  // Инициализация глобальных обработчиков ошибок
  initGlobalErrorHandlers();

  // Хранилище активных сокетов для проверки уникальности ников
  const activeSockets = new Map();

  // Текущий таймер вопроса
  let currentTimer = null;

  io.on("connection", (socket) => {
    console.log("Клиент подключился:", socket.id);

    // Аутентификация хоста
    socket.on("authenticateHost", (password) => {
      try {
        const validation = validateHostPassword(password);
        if (!validateOrThrow(validation, socket, "host authentication")) {
          return;
        }

        // Проверяем, не занят ли уже хост
        const existingHost = Array.from(activeSockets.values()).find((s) => s.isHost);
        if (existingHost) {
          socket.emit("hostAuthResult", {
            success: false,
            reason: "already_host",
          });
          return;
        }

        const HOST_PASSWORD = process.env.HOST_PASSWORD || config.security.hostPassword;

        if (!HOST_PASSWORD) {
          console.error(
            "ОШИБКА: HOST_PASSWORD не установлен! Установите переменную окружения HOST_PASSWORD",
          );
          socket.emit("hostAuthResult", {
            success: false,
            reason: "server_config_error",
          });
          return;
        }
        if (password === HOST_PASSWORD) {
          socket.isHost = true;
          activeSockets.set(socket.id, socket);
          socket.emit("hostAuthResult", { success: true });
          console.log("Хост успешно авторизован:", socket.id);
        } else {
          socket.emit("hostAuthResult", {
            success: false,
            reason: "wrong_password",
          });
        }
      } catch (error) {
        handleSocketError(socket, error, "authenticateHost");
      }
    });

    socket.on("disconnect", () => {
      if (socket.isHost) {
        console.log("Хост отключился:", socket.id);
        // Очищаем текущий таймер при отключении хоста
        if (currentTimer) {
          currentTimer.clearTimer();
          currentTimer = null;
        }
      } else if (socket.nickname) {
        console.log(`Игрок отключился: ${socket.nickname} (${socket.id})`);
      }
      activeSockets.delete(socket.id);
    });

    // Отправляем список файлов ведущему
    socket.on("getQuizList", () => {
      if (!socket.isHost) return;

      const fs = require("fs");
      const path = require("path");
      const dirPath = path.join(__dirname, "../../quizzes");

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
      }

      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".txt"));
      socket.emit("quizList", files);
    });

    // Отправляем конфигурацию клиенту
    socket.on("getConfig", () => {
      socket.emit("configData", config);
    });

    // Ведущий выбирает квиз
    socket.on("selectQuiz", (data) => {
      if (!socket.isHost) return;

      try {
        const validation = validateQuizSelection(data);
        if (!validateOrThrow(validation, socket, "quiz selection")) {
          return;
        }

        const result = gameService.loadQuiz(
          data.fileName,
          data.shuffle,
          data.questionCount,
          data.timeLimit,
        );

        if (result.success) {
          io.emit("quizReady", data.fileName);
          console.log(result.message);
        } else {
          socket.emit("quizError", { message: result.error });
        }
      } catch (error) {
        handleSocketError(socket, error, "selectQuiz");
      }
    });

    // Вход пользователя
    socket.on("join", (nickname) => {
      try {
        const validation = validateNickname(nickname);
        if (!validation.isValid) {
          socket.emit("joinError", validation.error);
          return;
        }

        const trimmedNickname = validation.value;

        // Проверяем, не занят ли никнейм другим активным игроком
        const isNicknameTaken = Array.from(activeSockets.values()).some(
          (s) => s.nickname === trimmedNickname && s.id !== socket.id,
        );

        if (isNicknameTaken) {
          socket.emit("joinError", "Этот никнейм уже занят. Выберите другой.");
          return;
        }

        // Устанавливаем никнейм
        socket.nickname = trimmedNickname;
        activeSockets.set(socket.id, socket);

        // Инициализируем счёт, если ещё не существует
        const currentScores = gameService.getAllPlayersScores();
        if (currentScores[trimmedNickname] === undefined) {
          // Счёт будет инициализирован при первом ответе
        }

        console.log(`${trimmedNickname} присоединился`);

        // Обновляем список игроков
        const players = Array.from(activeSockets.values())
          .filter((s) => s.nickname)
          .map((s) => s.nickname);

        io.emit("playerListUpdate", players);
      } catch (error) {
        handleSocketError(socket, error, "join");
      }
    });

    // Управление ведущего: Следующий вопрос
    socket.on("nextQuestion", () => {
      if (!socket.isHost) return;

      // Функция запуска нового вопроса
      const launchNextQuestion = () => {
        const question = gameService.getNextQuestion();
        if (question) {
          resetAnswerFlags(activeSockets);
          io.emit("updateQuestion", question);

          // Очищаем предыдущий таймер если есть
          if (currentTimer) {
            currentTimer.clearTimer();
          }

          // Запускаем новый таймер
          currentTimer = startQuestionTimer(io, activeSockets, question.timeLeft);
        } else {
          // Квиз завершен
          const currentScores = gameService.getAllPlayersScores();
          io.emit("quizFinished", currentScores);
        }
      };

      if (gameService.isCurrentQuestionActive()) {
        // Завершаем текущий вопрос досрочно
        if (currentTimer) {
          const result = currentTimer.endQuestion();
          currentTimer = null;

          if (result) {
            const currentScores = gameService.getAllPlayersScores();
            io.emit("timeOver", {
              scores: currentScores,
              correctAnswer: result.correctAnswer,
              currentOptions: result.currentOptions,
            });
          }
        }

        // Добавляем небольшую задержку перед запуском нового вопроса
        setTimeout(launchNextQuestion, 500);
        return;
      }

      launchNextQuestion();
    });

    socket.on("resetGame", () => {
      if (!socket.isHost) return;

      // Очищаем таймер при сбросе игры
      if (currentTimer) {
        currentTimer.clearTimer();
        currentTimer = null;
      }

      gameService.resetGame();
      io.emit("gameReset");
    });

    // Пауза/продолжение игры
    socket.on("togglePause", () => {
      if (!socket.isHost) return;

      if (currentTimer && gameService.isCurrentQuestionActive()) {
        const isPaused = gameService.togglePause();

        if (isPaused) {
          // Пауза - останавливаем таймер
          currentTimer.clearTimer();
          io.emit("gamePaused");
        } else {
          // Продолжение - запускаем таймер с оставшимся временем
          const timeLeft = gameService.getRemainingTime();
          currentTimer = startQuestionTimer(io, activeSockets, timeLeft);
          io.emit("gameResumed", { timeLeft });
        }
      }
    });

    // --- НОВЫЕ СОБЫТИЯ ДЛЯ АНАЛИТИКИ ---
    socket.on("getAnalytics", () => {
      if (!socket.isHost) return;

      const analytics = gameService.getAnalytics();
      socket.emit("analyticsData", analytics);
    });

    socket.on("getQuestionAnalytics", (questionIndex) => {
      if (!socket.isHost) return;

      const analytics = gameService.getQuestionAnalytics(questionIndex);
      socket.emit("questionAnalyticsData", analytics);
    });

    // --- ЭКСПОРТ РЕЗУЛЬТАТОВ В CSV ИЛИ XLSX ---
    socket.on("exportResults", (format) => {
      if (!socket.isHost) return;

      try {
        const result = gameService.exportResults(format);

        if (format === "xlsx") {
          // Для Excel файлов отправляем буфер в base64
          const base64Data = Buffer.from(result).toString("base64");
          socket.emit("xlsxExportReady", {
            data: base64Data,
            filename: `quiz_results_${new Date().toISOString().slice(0, 10)}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
        } else {
          // Для CSV отправляем текст
          socket.emit("csvExportReady", result);
        }
      } catch (error) {
        handleSocketError(socket, error, "exportResults");
      }
    });

    socket.on("submitAnswer", (index) => {
      try {
        const now = Date.now();
        const timeElapsed = (now - gameService.questionStartTime) / 1000;

        // Проверяем, активен ли вопрос
        if (!gameService.isCurrentQuestionActive()) {
          return;
        }

        // Проверяем, что игрок авторизован (имеет никнейм)
        if (!socket.nickname) {
          return;
        }

        if (timeElapsed > config.game.timeLimit + 0.5) return; // TIME_LIMIT + погрешность

        // Проверяем, уже ли ответил пользователь (важно проверять до обработки)
        if (socket.answered) return;

        const currentQuestionIndex = gameService.getCurrentQuestionIndex();
        const totalQuestions = gameService.getTotalQuestions();
        const currentQ = gameService.quizData[currentQuestionIndex];

        if (!currentQ) return;

        // Валидация индекса ответа
        const validation = validateAnswerIndex(index, currentQ.options.length);
        if (!validation.isValid) {
          return;
        }

        // Валидация времени ответа
        const timeValidation = validateResponseTime(timeElapsed);
        if (!timeValidation.isValid) {
          return;
        }

        // Устанавливаем флаг ответа сразу, чтобы предотвратить повторные попытки
        socket.answered = true;

        // Обработка ответа
        const result = gameService.processAnswer(socket.nickname, index, timeElapsed);

        if (result.success) {
          // Отправляем игроку результат его ответа
          socket.emit("answerResult", {
            isCorrect: result.isCorrect,
            scoreEarned: result.scoreEarned,
            totalScore: gameService.getAllPlayersScores()[socket.nickname] || 0,
          });

          // Обновляем статистику
          io.emit("updateStats", gameService.votes);

          // Проверяем, все ли ответили
          const totalPlayers = Array.from(activeSockets.values()).filter((s) => s.nickname).length;

          if (gameService.answeredUsers.size >= totalPlayers && totalPlayers > 0) {
            const endResult = gameService.endCurrentQuestion();
            if (endResult) {
              const currentScores = gameService.getAllPlayersScores();
              io.emit("timeOver", {
                scores: currentScores,
                correctAnswer: endResult.correctAnswer,
                currentOptions: endResult.currentOptions,
              });
            }
          }
        }
      } catch (error) {
        handleSocketError(socket, error, "submitAnswer");
      }
    });
  });
}

module.exports = setupSocketRoutes;
