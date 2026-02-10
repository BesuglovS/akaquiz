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
const config = require("./config");

// Статические файлы
app.use(express.static(path.join(__dirname, "public")));

// Инициализация маршрутов Socket.IO
setupSocketRoutes(io);

console.log("Сервер запущен");

const port = config.server.port;
const host = config.server.host;

server.listen(port, host, () => {
  console.log(`Сервер: http://${host}:${port}`);
});
