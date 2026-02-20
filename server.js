const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const compression = require("compression");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Подключаем модули
const setupSocketRoutes = require("./src/routes/socketRoutes");
const config = require("./config");

// Сжатие ответов
app.use(compression());

// Статические файлы с кэшированием
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d", // Кэширование на 1 день
    etag: true,
  }),
);

// Инициализация маршрутов Socket.IO
setupSocketRoutes(io);

console.log("Сервер запущен");

const port = config.server.port;
const host = config.server.host;

// Graceful shutdown
let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} получен. Завершение работы сервера...`);

  // Закрываем все Socket.IO соединения
  io.close(() => {
    console.log("Socket.IO соединения закрыты");
  });

  // Закрываем HTTP сервер
  server.close((err) => {
    if (err) {
      console.error("Ошибка при закрытии сервера:", err);
      process.exit(1);
    }

    console.log("HTTP сервер закрыт");
    process.exit(0);
  });

  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    console.error("Принудительное завершение работы (таймаут 10с)");
    process.exit(1);
  }, 10000);
};

// Обработчики сигналов завершения
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Обработка необработанных исключений
process.on("uncaughtException", (error) => {
  console.error("Необработанное исключение:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Необработанный Promise rejection:", reason);
});

server.listen(port, host, () => {
  console.log(`Сервер: http://${host}:${port}`);
});
