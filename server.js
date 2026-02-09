const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
let quizData = [];
let currentQuestionIndex = -1;
let votes = {};
let scores = {};
let answeredUsers = new Set();
let timer = null;
let questionStartTime = 0;
let isQuestionActive = false;
const HOST_PASSWORD = process.env.HOST_PASSWORD || "rty6tedde"; // Пароль из .env или значение по умолчанию
let hostSocketId = null; // ID сокета текущего ведущего

// --- АНАЛИТИКА ВРЕМЕНИ ОТВЕТОВ ---
let answerAnalytics = {
  totalAnswers: 0,
  correctAnswers: 0,
  averageResponseTime: 0,
  responseTimeDistribution: [], // массив времени ответов в секундах
  questionStats: [], // статистика по каждому вопросу
};

const MAX_SCORE = 100;
const MIN_SCORE = 20;
const TIME_LIMIT = 15;

// Функция для парсинга текстового файла
function loadQuizFile(fileName) {
  const filePath = path.join(__dirname, "quizzes", fileName);
  const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const blocks = content.split("\n\n").filter((block) => block.trim() !== "");

  // Вспомогательная функция: извлекает текст и первое изображение из строки
  function parseContent(text) {
    const imgMatch = text.match(/\[img:(.*?)\]/);
    let imgSrc = null;
    let cleanText = text;

    if (imgMatch) {
      imgSrc = imgMatch[1].trim();
      if (!imgSrc.startsWith("http") && !imgSrc.startsWith("https")) {
        imgSrc = "/media/" + imgSrc;
      }
      // Удаляем ВСЕ [img:...] теги из текста, чтобы остался только чистый текст
      cleanText = text.replace(/\[img:.*?\]/g, "").trim();
    }

    return {
      text: cleanText,
      img: imgSrc, // null, если нет изображения
    };
  }

  return blocks.map((block) => {
    const lines = block.split("\n");

    // --- Вопрос ---
    let questionLine = "";
    let questionImg = null;
    let questionText = "";

    const questionLineFull = lines.find((line) =>
      line.trim().startsWith("Вопрос:"),
    );
    if (questionLineFull) {
      const afterPrefix = questionLineFull.trim().substring("Вопрос:".length);
      const parsedQ = parseContent(afterPrefix);
      questionText = parsedQ.text;
      questionImg = parsedQ.img;
    }

    // --- Варианты ---
    const options = [];
    const optionsStartIndex = lines.findIndex(
      (line) => line.trim() === "Варианты:",
    );
    if (optionsStartIndex !== -1) {
      for (let i = optionsStartIndex + 1; i < lines.length; i++) {
        const line = lines[i].trimEnd(); // не удаляем начальные пробелы — текст может начинаться с них
        if (line.trim().startsWith("Ответ:")) break;

        // Передаём исходную строку (без trim'а слева, но с trim'ом справа)
        // Если строка пустая — оставляем пустой текст
        const rawOptionLine = lines[i].endsWith("\n") ? lines[i] : lines[i]; // просто берём как есть
        const parsedOpt = parseContent(rawOptionLine);
        options.push({
          text: parsedOpt.text,
          img: parsedOpt.img,
        });
      }
    }

    // --- Правильный ответ ---
    let correct = -1;
    const answerLine = lines.find((line) => line.trim().startsWith("Ответ:"));
    if (answerLine) {
      const answerNum = parseInt(
        answerLine.trim().substring("Ответ:".length).trim(),
        10,
      );
      // Преобразуем нумерацию из "с 1" в индекс "с 0"
      correct = isNaN(answerNum) ? -1 : answerNum - 1;
    }

    return {
      question: questionText,
      questionImg: questionImg,
      options: options,
      correct: correct,
    };
  });
}

// Функция-помощник для сбора актуальных очков всех игроков
function getAllPlayersScores() {
  const allScores = {};
  const sockets = io.sockets.sockets;

  sockets.forEach((s) => {
    if (s.nickname) {
      // Если у игрока еще нет очков, ставим 0, иначе берем из базы
      allScores[s.nickname] = scores[s.nickname] || 0;
    }
  });
  return allScores;
}

io.on("connection", (socket) => {
  // Аутентификация хоста
  socket.on("authenticateHost", (password) => {
    if (hostSocketId !== null) {
      socket.emit("hostAuthResult", { success: false, reason: "already_host" });
      return;
    }

    if (password === HOST_PASSWORD) {
      hostSocketId = socket.id;
      socket.isHost = true;
      socket.emit("hostAuthResult", { success: true });
      console.log("Хост успешно авторизован");
    } else {
      socket.emit("hostAuthResult", {
        success: false,
        reason: "wrong_password",
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === hostSocketId) {
      hostSocketId = null;
      console.log("Хост отключился");
    }
  });

  // Отправляем список файлов ведущему
  socket.on("getQuizList", () => {
    if (!socket.isHost) return;
    const dirPath = path.join(__dirname, "quizzes");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".txt"));
    socket.emit("quizList", files);
  });

  function shuffleArray(array) {
    const shuffled = [...array]; // копируем, чтобы не мутировать оригинал
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Ведущий выбирает квиз
  socket.on("selectQuiz", (data) => {
    if (!socket.isHost) return;
    const { fileName, shuffle = false, questionCount = null } = data;
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

    quizData = loadedData;
    currentQuestionIndex = -1;
    scores = {};
    io.emit("quizReady", fileName);
    console.log(
      `Загружен квиз: ${fileName}, перемешан: ${shuffle}, вопросов: ${quizData.length}`,
    );
  });

  // Вход пользователя (ОБЪЕДИНЕННЫЙ)
  // Внутри io.on("connection", (socket) => { ... })

  socket.on("join", (nickname) => {
    // Проверяем, что ник не пустой
    if (!nickname || typeof nickname !== "string" || nickname.trim() === "") {
      socket.emit("joinError", "Никнейм не может быть пустым");
      return;
    }

    nickname = nickname.trim();

    // Проверяем, не занят ли никнейм другим активным игроком
    const isNicknameTaken = Array.from(io.sockets.sockets.values()).some(
      (s) => s.nickname === nickname && s.id !== socket.id,
    );

    if (isNicknameTaken) {
      socket.emit("joinError", "Этот никнейм уже занят. Выберите другой.");
      return;
    }

    // Устанавливаем никнейм
    socket.nickname = nickname;

    // Инициализируем счёт, если ещё не существует
    if (scores[nickname] === undefined) {
      scores[nickname] = 0;
    } else {
      // Если счёт уже есть (например, после переподключения), оставляем его
      // Но это допустимо ТОЛЬКО если предыдущий сокет с таким ником отключился
      // В нашем случае выше мы запрещаем дубли, так что это безопасно
    }

    console.log(`${nickname} присоединился`);

    // Обновляем список игроков
    const players = Array.from(io.sockets.sockets.values())
      .filter((s) => s.nickname)
      .map((s) => s.nickname);

    io.emit("playerListUpdate", players);
  });

  // Управление ведущего: Следующий вопрос
  socket.on("nextQuestion", () => {
    if (!socket.isHost) return;
    if (isQuestionActive) {
      if (timer) clearInterval(timer);
      isQuestionActive = false;
      const correctIndex = quizData[currentQuestionIndex].correct;

      const currentScores = getAllPlayersScores();
      io.emit("timeOver", {
        scores: currentScores,
        correctAnswer: correctIndex,
        currentOptions: quizData[currentQuestionIndex].options,
      });

      return;
    }

    currentQuestionIndex++;
    answeredUsers.clear();

    if (currentQuestionIndex < quizData.length) {
      isQuestionActive = true;
      votes = {};
      const question = quizData[currentQuestionIndex];
      questionStartTime = Date.now();

      io.emit("updateQuestion", {
        question: question.question,
        questionImg: question.questionImg,
        options: question.options,
        timeLeft: TIME_LIMIT,
        questionNumber: currentQuestionIndex + 1, // начинаем с 1
        totalQuestions: quizData.length,
      });

      if (timer) clearInterval(timer);
      let timeLeft = TIME_LIMIT;

      timer = setInterval(() => {
        timeLeft--;
        io.emit("timerTick", timeLeft);

        if (timeLeft <= 0) {
          clearInterval(timer);
          isQuestionActive = false;
          const correctIndex = quizData[currentQuestionIndex].correct;

          const currentScores = getAllPlayersScores();
          io.emit("timeOver", {
            scores: currentScores,
            correctAnswer: correctIndex,
            currentOptions: quizData[currentQuestionIndex].options,
          });
        }
      }, 1000);
    } else {
      if (timer) clearInterval(timer);
      isQuestionActive = false;
      io.emit("quizFinished", getAllPlayersScores());
    }
  });

  socket.on("resetGame", () => {
    if (!socket.isHost) return;
    currentQuestionIndex = -1;
    scores = {};
    quizData = [];
    // Сброс аналитики при сбросе игры
    answerAnalytics = {
      totalAnswers: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      responseTimeDistribution: [],
      questionStats: [],
    };
    io.emit("gameReset");
  });

  // --- НОВЫЕ СОБЫТИЯ ДЛЯ АНАЛИТИКИ ---
  socket.on("getAnalytics", () => {
    if (!socket.isHost) return;
    socket.emit("analyticsData", answerAnalytics);
  });

  socket.on("getQuestionAnalytics", (questionIndex) => {
    if (!socket.isHost) return;

    // Если передан -1, показываем аналитику по последнему вопросу
    if (questionIndex === -1) {
      const lastQuestionIndex = answerAnalytics.questionStats.length - 1;
      if (lastQuestionIndex >= 0) {
        socket.emit(
          "questionAnalyticsData",
          answerAnalytics.questionStats[lastQuestionIndex],
        );
      } else {
        socket.emit("questionAnalyticsData", {
          question: "Нет данных",
          totalAnswers: 0,
          correctAnswers: 0,
          averageResponseTime: 0,
          responseTimes: [],
        });
      }
    } else {
      // Показываем аналитику по конкретному вопросу
      if (answerAnalytics.questionStats[questionIndex]) {
        socket.emit(
          "questionAnalyticsData",
          answerAnalytics.questionStats[questionIndex],
        );
      }
    }
  });

  // --- ЭКСПОРТ РЕЗУЛЬТАТОВ В CSV ---
  socket.on("exportResults", () => {
    if (!socket.isHost) return;

    const csvContent = generateCSVResults();
    socket.emit("csvExportReady", csvContent);
  });

  function generateCSVResults() {
    const headers = [
      "Никнейм",
      "Очки",
      "Всего ответов",
      "Правильных ответов",
      "Процент правильных",
      "Среднее время ответа (сек)",
    ];

    // Получаем список всех игроков
    const allScores = getAllPlayersScores();
    const players = Object.keys(allScores);

    // Формируем строки для CSV
    const rows = players.map((nickname) => {
      const totalAnswers = answerAnalytics.responseTimeDistribution.length;
      const correctAnswers = answerAnalytics.correctAnswers;
      const accuracy =
        totalAnswers > 0
          ? ((correctAnswers / totalAnswers) * 100).toFixed(2)
          : "0.00";
      const avgResponseTime = answerAnalytics.averageResponseTime.toFixed(2);

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
    const questionRows = answerAnalytics.questionStats.map(
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
      ...answerAnalytics.responseTimeDistribution.map((time) =>
        time.toFixed(2),
      ),
    ].join("\n");

    return csv;
  }

  socket.on("submitAnswer", (index) => {
    const now = Date.now();
    const timeElapsed = (now - questionStartTime) / 1000;

    if (!isQuestionActive || timeElapsed > TIME_LIMIT + 0.5) return;
    if (answeredUsers.has(socket.id)) return;

    const currentQ = quizData[currentQuestionIndex];
    if (!currentQ) return;

    // --- СБОР АНАЛИТИКИ ОТВЕТОВ ---
    answerAnalytics.totalAnswers++;
    answerAnalytics.responseTimeDistribution.push(timeElapsed);

    const isCorrect = index === currentQ.correct;
    if (isCorrect) {
      answerAnalytics.correctAnswers++;
    }

    // Статистика по текущему вопросу
    if (!answerAnalytics.questionStats[currentQuestionIndex]) {
      answerAnalytics.questionStats[currentQuestionIndex] = {
        question: currentQ.question,
        correctAnswers: 0,
        totalAnswers: 0,
        averageResponseTime: 0,
        responseTimes: [],
      };
    }

    const questionStat = answerAnalytics.questionStats[currentQuestionIndex];
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
    answerAnalytics.averageResponseTime =
      answerAnalytics.responseTimeDistribution.reduce((a, b) => a + b, 0) /
      answerAnalytics.responseTimeDistribution.length;

    if (index === currentQ.correct && socket.nickname) {
      let scoreEarned = Math.round(
        MAX_SCORE - (timeElapsed * (MAX_SCORE - MIN_SCORE)) / TIME_LIMIT,
      );
      scoreEarned = Math.max(MIN_SCORE, Math.min(MAX_SCORE, scoreEarned));
      scores[socket.nickname] = (scores[socket.nickname] || 0) + scoreEarned;
    }

    answeredUsers.add(socket.id);
    if (!votes[index]) votes[index] = 0;
    votes[index]++;
    io.emit("updateStats", votes);

    const totalPlayers = Array.from(io.sockets.sockets.values()).filter(
      (s) => s.nickname,
    ).length;

    if (answeredUsers.size >= totalPlayers && totalPlayers > 0) {
      if (timer) clearInterval(timer);
      isQuestionActive = false;
      const correctIndex = quizData[currentQuestionIndex].correct;

      const currentScores = getAllPlayersScores();
      const q = quizData[currentQuestionIndex];
      io.emit("timeOver", {
        scores: currentScores,
        correctAnswer: q.correct,
        currentOptions: q.options,
      });
    }
  });
}); // <--- ЗАКРЫВАЕТ io.on("connection")

const port = process.env.PORT || 80;
server.listen(port, "0.0.0.0", () => {
  console.log(`Сервер: http://localhost:${port}`);
});
