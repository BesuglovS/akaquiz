const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

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

const MAX_SCORE = 100;
const MIN_SCORE = 20;
const TIME_LIMIT = 15;

// Функция для парсинга текстового файла
function loadQuizFile(fileName) {
  const filePath = path.join(__dirname, "quizzes", fileName);
  const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const blocks = content.split("\n\n").filter((block) => block.trim() !== "");

  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim());

    const parseLine = (text) => {
      const imgMatch = text.match(/\[img:(.*?)\]/);
      if (!imgMatch) return { text: text.trim(), img: null };

      let imgSrc = imgMatch[1].trim();

      // Проверяем: если это не внешняя ссылка (http/https),
      // значит это локальный файл в папке /media/
      if (!imgSrc.startsWith("http")) {
        imgSrc = "/media/" + imgSrc;
      }

      return {
        text: text.replace(/\[img:.*?\]/g, "").trim(),
        img: imgSrc,
      };
    };

    const questionData = parseLine(lines[0].replace("Вопрос:", ""));
    const rawOptions = lines[1].replace("Варианты:", "").split(",");

    return {
      question: questionData.text,
      questionImg: questionData.img,
      options: rawOptions.map((opt) => parseLine(opt)),
      correct: parseInt(lines[2].replace("Ответ:", "").trim()),
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
  // Отправляем список файлов ведущему
  socket.on("getQuizList", () => {
    const dirPath = path.join(__dirname, "quizzes");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".txt"));
    socket.emit("quizList", files);
  });

  // Ведущий выбирает квиз
  socket.on("selectQuiz", (fileName) => {
    quizData = loadQuizFile(fileName);
    currentQuestionIndex = -1;
    scores = {};
    io.emit("quizReady", fileName);
    console.log(`Загружен квиз: ${fileName}`);
  });

  // Вход пользователя (ОБЪЕДИНЕННЫЙ)
  socket.on("join", (nickname) => {
    socket.nickname = nickname;
    if (!scores[nickname]) scores[nickname] = 0;

    console.log(`${nickname} присоединился`);

    const players = [];
    const sockets = io.sockets.sockets;
    sockets.forEach((s) => {
      if (s.nickname) players.push(s.nickname);
    });

    io.emit("playerListUpdate", players);
  });

  // Управление ведущего: Следующий вопрос
  socket.on("nextQuestion", () => {
    if (isQuestionActive) {
      if (timer) clearInterval(timer);
      isQuestionActive = false;
      const correctIndex = quizData[currentQuestionIndex].correct;

      const currentScores = getAllPlayersScores();
      io.emit("timeOver", {
        scores: currentScores,
        correctAnswer: correctIndex,
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
        questionImg: question.questionImg, // <--- Важно добавить передачу картинки вопроса
        options: question.options,
        timeLeft: TIME_LIMIT,
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
    currentQuestionIndex = -1;
    scores = {};
    quizData = [];
    io.emit("gameReset");
  });

  socket.on("submitAnswer", (index) => {
    const now = Date.now();
    const timeElapsed = (now - questionStartTime) / 1000;

    if (!isQuestionActive || timeElapsed > TIME_LIMIT + 0.5) return;
    if (answeredUsers.has(socket.id)) return;

    const currentQ = quizData[currentQuestionIndex];
    if (!currentQ) return;

    if (index === currentQ.correct && socket.nickname) {
      let scoreEarned = Math.round(
        MAX_SCORE - (timeElapsed * (MAX_SCORE - MIN_SCORE)) / TIME_LIMIT
      );
      scoreEarned = Math.max(MIN_SCORE, Math.min(MAX_SCORE, scoreEarned));
      scores[socket.nickname] = (scores[socket.nickname] || 0) + scoreEarned;
    }

    answeredUsers.add(socket.id);
    if (!votes[index]) votes[index] = 0;
    votes[index]++;
    io.emit("updateStats", votes);

    const totalPlayers = Array.from(io.sockets.sockets.values()).filter(
      (s) => s.nickname
    ).length;

    if (answeredUsers.size >= totalPlayers && totalPlayers > 0) {
      if (timer) clearInterval(timer);
      isQuestionActive = false;
      const correctIndex = quizData[currentQuestionIndex].correct;

      const currentScores = getAllPlayersScores();
      io.emit("timeOver", {
        scores: currentScores,
        correctAnswer: correctIndex,
      });
    }
  });
}); // <--- ЗАКРЫВАЕТ io.on("connection")

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер: http://localhost:${PORT}`);
});
