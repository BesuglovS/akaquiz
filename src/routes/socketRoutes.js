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
 * Обработчики Socket.IO событий
 * @param {Socket} io - экземпляр Socket.IO
 */
function setupSocketRoutes(io) {
  // Инициализация глобальных обработчиков ошибок
  initGlobalErrorHandlers();

  // Хранилище активных сокетов для проверки уникальности ников
  const activeSockets = new Map();

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
        const existingHost = Array.from(activeSockets.values()).find(
          (s) => s.isHost,
        );
        if (existingHost) {
          socket.emit("hostAuthResult", {
            success: false,
            reason: "already_host",
          });
          return;
        }

        const HOST_PASSWORD = process.env.HOST_PASSWORD || "rty6tedde";
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
        if (!validateOrThrow(validation, socket, "nickname validation")) {
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

      if (gameService.isCurrentQuestionActive()) {
        // Завершаем текущий вопрос
        const result = gameService.endCurrentQuestion();
        if (result) {
          const currentScores = gameService.getAllPlayersScores();
          io.emit("timeOver", {
            scores: currentScores,
            correctAnswer: result.correctAnswer,
            currentOptions: result.currentOptions,
          });
        }

        // Добавляем небольшую задержку перед запуском нового вопроса, чтобы игроки успели увидеть результаты
        setTimeout(() => {
          const nextQuestion = gameService.getNextQuestion();
          if (nextQuestion) {
            // Сбрасываем флаги ответов для всех игроков при начале нового вопроса
            Array.from(activeSockets.values()).forEach((s) => {
              if (s.nickname) {
                s.answered = false;
              }
            });

            io.emit("updateQuestion", nextQuestion);

            // Запускаем таймер
            let timeLeft = nextQuestion.timeLeft;
            const timer = setInterval(() => {
              timeLeft--;
              io.emit("timerTick", timeLeft);

              if (timeLeft <= 0) {
                clearInterval(timer);
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
            }, 1000);
          } else {
            // Квиз завершен
            const currentScores = gameService.getAllPlayersScores();
            io.emit("quizFinished", currentScores);
          }
        }, 500); // Задержка 0.5 секунды

        return;
      }

      const question = gameService.getNextQuestion();
      if (question) {
        // Сбрасываем флаги ответов для всех игроков при начале нового вопроса
        Array.from(activeSockets.values()).forEach((s) => {
          if (s.nickname) {
            s.answered = false;
          }
        });

        io.emit("updateQuestion", question);

        // Запускаем таймер
        let timeLeft = question.timeLeft;
        const timer = setInterval(() => {
          timeLeft--;
          io.emit("timerTick", timeLeft);

          if (timeLeft <= 0) {
            clearInterval(timer);
            const result = gameService.endCurrentQuestion();
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
      } else {
        // Квиз завершен
        const currentScores = gameService.getAllPlayersScores();
        io.emit("quizFinished", currentScores);
      }
    });

    socket.on("resetGame", () => {
      if (!socket.isHost) return;

      gameService.resetGame();
      io.emit("gameReset");
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
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
        const result = gameService.processAnswer(
          socket.nickname,
          index,
          timeElapsed,
        );

        if (result.success) {
          // Обновляем статистику
          io.emit("updateStats", gameService.votes);

          // Проверяем, все ли ответили
          const totalPlayers = Array.from(activeSockets.values()).filter(
            (s) => s.nickname,
          ).length;

          if (
            gameService.answeredUsers.size >= totalPlayers &&
            totalPlayers > 0
          ) {
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
