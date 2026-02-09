const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Подключаем модули
const setupSocketRoutes = require("./src/routes/socketRoutes");

// Статические файлы
app.use(express.static(path.join(__dirname, "public")));

// Инициализация маршрутов Socket.IO
setupSocketRoutes(io);

console.log("Сервер запущен");

const port = process.env.PORT || 80;
server.listen(port, "0.0.0.0", () => {
  console.log(`Сервер: http://localhost:${port}`);
});
