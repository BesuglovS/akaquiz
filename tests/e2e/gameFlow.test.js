const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const ioClient = require("socket.io-client");
const setupSocketRoutes = require("../../src/routes/socketRoutes");
const gameService = require("../../src/services/gameService");

describe("End-to-End Game Flow", () => {
  let server;
  let io;
  let serverPort;
  let hostSocket;
  let playerSocket;

  // Helper function to create a socket connection
  const createSocket = (options = {}) => {
    return ioClient(`http://localhost:${serverPort}`, {
      transports: ["websocket"],
      forceNew: true,
      ...options,
    });
  };

  // Helper to wait for an event
  const waitForEvent = (socket, event, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  beforeAll((done) => {
    const app = express();
    server = createServer(app);
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    setupSocketRoutes(io);

    server.listen(() => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    // Close all connections
    if (hostSocket && hostSocket.connected) {
      hostSocket.disconnect();
    }
    if (playerSocket && playerSocket.connected) {
      playerSocket.disconnect();
    }

    // Check if server is still running before closing
    if (io && !io.sockets.sockets.size) {
      io.close();
    }

    if (server && server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(() => {
    // Reset game state before each test
    gameService.resetGame();
  });

  afterEach(() => {
    // Clean up sockets after each test
    if (hostSocket && hostSocket.connected) {
      hostSocket.disconnect();
    }
    if (playerSocket && playerSocket.connected) {
      playerSocket.disconnect();
    }
  });

  describe("Complete Game Session", () => {
    test("should complete full game flow from host authentication to quiz finish", async () => {
      // Create sockets
      hostSocket = createSocket();
      playerSocket = createSocket();

      // Wait for connections
      await Promise.all([
        waitForEvent(hostSocket, "connect"),
        waitForEvent(playerSocket, "connect"),
      ]);

      // Step 1: Host authentication
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      const authResult = await waitForEvent(hostSocket, "hostAuthResult");
      expect(authResult.success).toBe(true);

      // Step 2: Get quiz list
      hostSocket.emit("getQuizList");
      const quizList = await waitForEvent(hostSocket, "quizList");
      expect(Array.isArray(quizList)).toBe(true);
      expect(quizList.length).toBeGreaterThan(0);

      // Step 3: Select quiz
      hostSocket.emit("selectQuiz", {
        fileName: quizList[0],
        shuffle: false,
        questionCount: 2,
      });
      const quizReady = await waitForEvent(hostSocket, "quizReady");
      expect(quizReady).toBeDefined();

      // Step 4: Player joins
      playerSocket.emit("join", "test-player");
      const playerList = await waitForEvent(playerSocket, "playerListUpdate");
      expect(playerList).toContain("test-player");

      // Step 5: Start first question
      hostSocket.emit("nextQuestion");
      const question1 = await waitForEvent(playerSocket, "updateQuestion");
      expect(question1).toBeDefined();
      expect(question1.question).toBeDefined();
      expect(question1.options).toBeDefined();

      // Step 6: Player submits answer
      playerSocket.emit("submitAnswer", 0);
      const timeOver = await waitForEvent(playerSocket, "timeOver");
      expect(timeOver.scores).toBeDefined();
      expect(timeOver.correctAnswer).toBeDefined();

      // Step 7: Start second question
      hostSocket.emit("nextQuestion");
      await waitForEvent(playerSocket, "updateQuestion");

      // Step 8: Submit answer and finish
      playerSocket.emit("submitAnswer", 0);
      await waitForEvent(playerSocket, "timeOver");

      // Step 9: Try to get next question - should finish quiz
      hostSocket.emit("nextQuestion");
      const quizFinished = await waitForEvent(hostSocket, "quizFinished");
      expect(quizFinished).toBeDefined();
    });

    test("should handle multiple players correctly", async () => {
      // Create host socket
      hostSocket = createSocket();
      await waitForEvent(hostSocket, "connect");

      // Authenticate host
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      const authResult = await waitForEvent(hostSocket, "hostAuthResult");
      expect(authResult.success).toBe(true);

      // Load quiz
      hostSocket.emit("getQuizList");
      const quizList = await waitForEvent(hostSocket, "quizList");
      hostSocket.emit("selectQuiz", {
        fileName: quizList[0],
        shuffle: false,
        questionCount: 1,
      });
      await waitForEvent(hostSocket, "quizReady");

      // Create multiple players
      const players = ["player1", "player2", "player3"];
      const playerSockets = [];

      for (const playerName of players) {
        const socket = createSocket();
        await waitForEvent(socket, "connect");
        socket.emit("join", playerName);
        playerSockets.push(socket);
      }

      // Wait for all players to receive player list update
      const joinPromises = playerSockets.map((socket) =>
        waitForEvent(socket, "playerListUpdate", 3000),
      );
      const playerLists = await Promise.all(joinPromises);

      // Verify all players are in the list
      for (const list of playerLists) {
        for (const playerName of players) {
          expect(list).toContain(playerName);
        }
      }

      // Start game
      hostSocket.emit("nextQuestion");
      await Promise.all(playerSockets.map((socket) => waitForEvent(socket, "updateQuestion")));

      // All players submit answers
      for (const socket of playerSockets) {
        socket.emit("submitAnswer", 0);
      }

      // Wait for time over for all players
      await Promise.all(playerSockets.map((socket) => waitForEvent(socket, "timeOver")));

      // Get analytics
      hostSocket.emit("getAnalytics");
      const analytics = await waitForEvent(hostSocket, "analyticsData");
      expect(analytics).toBeDefined();
      expect(analytics.totalAnswers).toBe(players.length);

      // Cleanup
      for (const socket of playerSockets) {
        socket.disconnect();
      }
    });

    test("should handle quiz with images correctly", async () => {
      // Create sockets
      hostSocket = createSocket();
      playerSocket = createSocket();

      await Promise.all([
        waitForEvent(hostSocket, "connect"),
        waitForEvent(playerSocket, "connect"),
      ]);

      // Authenticate host
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      const authResult = await waitForEvent(hostSocket, "hostAuthResult");
      expect(authResult.success).toBe(true);

      // Get quiz list and find one with images
      hostSocket.emit("getQuizList");
      const quizList = await waitForEvent(hostSocket, "quizList");
      const quizFile = quizList.find((f) => f.includes("foto")) || quizList[0];

      // Select quiz
      hostSocket.emit("selectQuiz", {
        fileName: quizFile,
        shuffle: false,
        questionCount: 1,
      });
      await waitForEvent(hostSocket, "quizReady");

      // Player joins
      playerSocket.emit("join", "test-player");
      await waitForEvent(playerSocket, "playerListUpdate");

      // Start question
      hostSocket.emit("nextQuestion");
      const question = await waitForEvent(playerSocket, "updateQuestion");

      // Verify question structure
      expect(question.question).toBeDefined();
      expect(question.options).toBeDefined();
      expect(Array.isArray(question.options)).toBe(true);
      expect(question.options.length).toBeGreaterThan(0);

      // Verify option structure
      question.options.forEach((option) => {
        expect(typeof option.text).toBe("string");
        expect(option.img === null || typeof option.img === "string").toBe(true);
      });

      // Submit answer
      playerSocket.emit("submitAnswer", 0);
      await waitForEvent(playerSocket, "timeOver");

      // Get analytics
      hostSocket.emit("getAnalytics");
      const analytics = await waitForEvent(hostSocket, "analyticsData");
      expect(analytics).toBeDefined();
    });

    test("should handle game reset correctly", async () => {
      // Create sockets
      hostSocket = createSocket();
      playerSocket = createSocket();

      await Promise.all([
        waitForEvent(hostSocket, "connect"),
        waitForEvent(playerSocket, "connect"),
      ]);

      // Authenticate host
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      await waitForEvent(hostSocket, "hostAuthResult");

      // Load quiz
      hostSocket.emit("getQuizList");
      const quizList = await waitForEvent(hostSocket, "quizList");
      hostSocket.emit("selectQuiz", {
        fileName: quizList[0],
        shuffle: false,
        questionCount: 1,
      });
      await waitForEvent(hostSocket, "quizReady");

      // Player joins
      playerSocket.emit("join", "reset-test-player");
      await waitForEvent(playerSocket, "playerListUpdate");

      // Start and answer question
      hostSocket.emit("nextQuestion");
      await waitForEvent(playerSocket, "updateQuestion");
      playerSocket.emit("submitAnswer", 0);
      await waitForEvent(playerSocket, "timeOver");

      // Reset game
      hostSocket.emit("resetGame");
      await waitForEvent(hostSocket, "gameReset");

      // Verify game state is reset
      expect(gameService.currentQuestionIndex).toBe(-1);
      expect(gameService.quizData).toEqual([]);
      expect(gameService.scores).toEqual({});
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid host password", async () => {
      hostSocket = createSocket();
      await waitForEvent(hostSocket, "connect");

      hostSocket.emit("authenticateHost", "wrong-password");
      const result = await waitForEvent(hostSocket, "hostAuthResult");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("wrong_password");
    });

    test("should handle duplicate host connection", async () => {
      // First host connects
      hostSocket = createSocket();
      await waitForEvent(hostSocket, "connect");

      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      const firstResult = await waitForEvent(hostSocket, "hostAuthResult");
      expect(firstResult.success).toBe(true);

      // Second host tries to connect
      const secondHostSocket = createSocket();
      await waitForEvent(secondHostSocket, "connect");

      secondHostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      const secondResult = await waitForEvent(secondHostSocket, "hostAuthResult");

      expect(secondResult.success).toBe(false);
      expect(secondResult.reason).toBe("already_host");

      secondHostSocket.disconnect();
    });

    test("should handle invalid quiz file", async () => {
      hostSocket = createSocket();
      await waitForEvent(hostSocket, "connect");

      // Authenticate
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      await waitForEvent(hostSocket, "hostAuthResult");

      // Try to load non-existent quiz
      hostSocket.emit("selectQuiz", {
        fileName: "non-existent.txt",
        shuffle: false,
        questionCount: null,
      });

      const error = await waitForEvent(hostSocket, "quizError");
      expect(error.message).toBeDefined();
    });

    test("should handle player with duplicate nickname", async () => {
      hostSocket = createSocket();
      playerSocket = createSocket();

      await Promise.all([
        waitForEvent(hostSocket, "connect"),
        waitForEvent(playerSocket, "connect"),
      ]);

      // Authenticate host
      hostSocket.emit("authenticateHost", process.env.HOST_PASSWORD);
      await waitForEvent(hostSocket, "hostAuthResult");

      // First player joins
      playerSocket.emit("join", "duplicate-name");
      await waitForEvent(playerSocket, "playerListUpdate");

      // Second player tries same name
      const secondPlayerSocket = createSocket();
      await waitForEvent(secondPlayerSocket, "connect");

      secondPlayerSocket.emit("join", "duplicate-name");
      const error = await waitForEvent(secondPlayerSocket, "joinError");

      expect(error).toContain("уже занят");

      secondPlayerSocket.disconnect();
    });
  });
});
