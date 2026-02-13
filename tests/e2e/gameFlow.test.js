const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const setupSocketRoutes = require("../../src/routes/socketRoutes");
const gameService = require("../../src/services/gameService");

// Mock socket.io-client to prevent actual connections
jest.mock("socket.io-client", () => {
  return jest.fn(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  }));
});

describe("End-to-End Game Flow", () => {
  let server;
  let io;
  let clientSocket;
  let hostSocket;
  let app;

  beforeAll((done) => {
    // Setup Express server
    app = express();
    server = createServer(app);
    io = new Server(server);

    // Setup routes
    setupSocketRoutes(io);

    server.listen(() => {
      const port = server.address().port;
      const clientUrl = `http://localhost:${port}`;

      // Create client connections
      const ioClient = require("socket.io-client");
      clientSocket = ioClient(clientUrl);
      hostSocket = ioClient(clientUrl);

      done();
    });
  });

  afterAll((done) => {
    clientSocket.disconnect();
    hostSocket.disconnect();
    server.close(done);
  });

  beforeEach(() => {
    // Reset game state
    gameService.resetGame();
  });

  describe("Complete Game Session", () => {
    test("should complete full game flow from host authentication to quiz finish", (done) => {
      // Set longer timeout for this test
      jest.setTimeout(15000);
      let hostAuthenticated = false;
      let quizLoaded = false;
      let playerJoined = false;
      let questionStarted = false;
      let answerSubmitted = false;
      let gameFinished = false;

      // Host authentication
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        expect(result.success).toBe(true);
        hostAuthenticated = true;
      });

      // Host loads quiz
      setTimeout(() => {
        hostSocket.emit("getQuizList");
      }, 100);

      hostSocket.on("quizList", (files) => {
        expect(Array.isArray(files)).toBe(true);
        expect(files.length).toBeGreaterThan(0);

        hostSocket.emit("selectQuiz", {
          fileName: files[0],
          shuffle: false,
          questionCount: 2,
        });
      });

      hostSocket.on("quizReady", (fileName) => {
        expect(fileName).toBeDefined();
        quizLoaded = true;
      });

      // Player joins
      setTimeout(() => {
        clientSocket.emit("join", "test-player");
      }, 200);

      clientSocket.on("joinError", (error) => {
        // Should not happen in successful flow
        expect(error).toBeUndefined();
      });

      clientSocket.on("playerListUpdate", (players) => {
        expect(players).toContain("test-player");
        playerJoined = true;
      });

      // Start game
      setTimeout(() => {
        hostSocket.emit("nextQuestion");
      }, 300);

      hostSocket.on("updateQuestion", (question) => {
        expect(question).toBeDefined();
        expect(question.question).toBeDefined();
        expect(question.options).toBeDefined();
        expect(question.timeLeft).toBeDefined();
        questionStarted = true;
      });

      // Player submits answer
      clientSocket.on("updateQuestion", (question) => {
        // Wait a moment for timer to start, then submit answer
        setTimeout(() => {
          clientSocket.emit("submitAnswer", 0); // Submit first option
        }, 100);
      });

      clientSocket.on("timeOver", (data) => {
        expect(data.scores).toBeDefined();
        expect(data.correctAnswer).toBeDefined();
        answerSubmitted = true;
      });

      // Continue to next question and finish
      setTimeout(() => {
        hostSocket.emit("nextQuestion");
      }, 500);

      setTimeout(() => {
        hostSocket.emit("nextQuestion"); // This should trigger quizFinished
      }, 700);

      hostSocket.on("quizFinished", (scores) => {
        expect(scores).toBeDefined();
        gameFinished = true;

        // Verify all steps completed
        expect(hostAuthenticated).toBe(true);
        expect(quizLoaded).toBe(true);
        expect(playerJoined).toBe(true);
        expect(questionStarted).toBe(true);
        expect(answerSubmitted).toBe(true);
        expect(gameFinished).toBe(true);

        done();
      });
    }, 10000);

    test("should handle multiple players correctly", (done) => {
      // Set longer timeout for this test
      jest.setTimeout(20000);
      const players = ["player1", "player2", "player3"];
      let connectedPlayers = 0;
      let allPlayersJoined = false;
      let allAnswersSubmitted = 0;

      // Authenticate host
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          // Load quiz
          hostSocket.emit("getQuizList");
        }
      });

      hostSocket.on("quizList", (files) => {
        hostSocket.emit("selectQuiz", {
          fileName: files[0],
          shuffle: false,
          questionCount: 1,
        });
      });

      hostSocket.on("quizReady", () => {
        // Join all players
        players.forEach((playerName) => {
          const playerSocket = require("socket.io-client")(
            `http://localhost:${server.address().port}`,
          );

          playerSocket.emit("join", playerName);

          playerSocket.on("playerListUpdate", (playerList) => {
            if (playerList.includes(playerName)) {
              connectedPlayers++;
              if (connectedPlayers === players.length) {
                allPlayersJoined = true;

                // Start game when all players joined
                setTimeout(() => {
                  hostSocket.emit("nextQuestion");
                }, 100);
              }
            }
          });

          playerSocket.on("updateQuestion", (question) => {
            // Submit answer
            setTimeout(() => {
              playerSocket.emit("submitAnswer", 0);
            }, 50);
          });

          playerSocket.on("timeOver", () => {
            allAnswersSubmitted++;

            if (allAnswersSubmitted === players.length) {
              // Verify leaderboard
              hostSocket.emit("getAnalytics");
            }
          });
        });
      });

      hostSocket.on("analyticsData", (analytics) => {
        expect(analytics).toBeDefined();
        expect(analytics.totalAnswers).toBe(players.length);

        done();
      });
    }, 15000);

    test("should handle quiz with images correctly", (done) => {
      // Set longer timeout for this test
      jest.setTimeout(15000);
      // This test verifies that questions and options with images are handled properly
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          hostSocket.emit("getQuizList");
        }
      });

      hostSocket.on("quizList", (files) => {
        // Try to find a quiz with images or use any available
        const quizFile = files.find((f) => f.includes("foto")) || files[0];

        hostSocket.emit("selectQuiz", {
          fileName: quizFile,
          shuffle: false,
          questionCount: 1,
        });
      });

      hostSocket.on("quizReady", () => {
        hostSocket.emit("nextQuestion");
      });

      hostSocket.on("updateQuestion", (question) => {
        // Verify question structure
        expect(question.question).toBeDefined();
        expect(question.options).toBeDefined();
        expect(Array.isArray(question.options)).toBe(true);

        // Check if question or options have images
        const hasQuestionImage = question.questionImg !== null;
        const hasOptionImages = question.options.some(
          (opt) => opt.img !== null,
        );

        // At minimum, verify the structure is correct
        expect(question.options.length).toBeGreaterThan(0);
        question.options.forEach((option) => {
          expect(typeof option.text).toBe("string");
          expect(option.img === null || typeof option.img === "string").toBe(
            true,
          );
        });

        // Submit answer to proceed
        setTimeout(() => {
          clientSocket.emit("submitAnswer", 0);
        }, 100);
      });

      clientSocket.on("timeOver", () => {
        // Verify scores are updated
        hostSocket.emit("getAnalytics");
      });

      hostSocket.on("analyticsData", (analytics) => {
        expect(analytics).toBeDefined();
        expect(analytics.totalAnswers).toBeGreaterThan(0);

        done();
      });
    }, 10000);

    test("should handle game reset correctly", (done) => {
      // Set longer timeout for this test
      jest.setTimeout(10000);
      let gameReset = false;

      // Complete a small game session
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          hostSocket.emit("getQuizList");
        }
      });

      hostSocket.on("quizList", (files) => {
        hostSocket.emit("selectQuiz", {
          fileName: files[0],
          shuffle: false,
          questionCount: 1,
        });
      });

      hostSocket.on("quizReady", () => {
        clientSocket.emit("join", "reset-test-player");
      });

      clientSocket.on("playerListUpdate", () => {
        hostSocket.emit("nextQuestion");
      });

      hostSocket.on("updateQuestion", (question) => {
        setTimeout(() => {
          clientSocket.emit("submitAnswer", 0);
        }, 50);
      });

      clientSocket.on("timeOver", () => {
        // Reset game
        hostSocket.emit("resetGame");
      });

      hostSocket.on("gameReset", () => {
        gameReset = true;

        // Verify game state is reset
        expect(gameService.currentQuestionIndex).toBe(-1);
        expect(gameService.quizData).toEqual([]);
        expect(gameService.scores).toEqual({});

        done();
      });
    }, 8000);
  });

  describe("Error Handling", () => {
    test("should handle invalid host password", (done) => {
      // Set timeout for this test
      jest.setTimeout(15000);
      hostSocket.emit("authenticateHost", "wrong-password");

      hostSocket.on("hostAuthResult", (result) => {
        expect(result.success).toBe(false);
        expect(result.reason).toBe("wrong_password");
        done();
      });
    });

    test("should handle duplicate host connection", (done) => {
      // Set timeout for this test
      jest.setTimeout(15000);
      // First host connects
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          // Try to connect another host
          const anotherHostSocket = require("socket.io-client")(
            `http://localhost:${server.address().port}`,
          );

          anotherHostSocket.emit(
            "authenticateHost",
            process.env.HOST_PASSWORD || "rty6tedde",
          );

          anotherHostSocket.on("hostAuthResult", (result) => {
            expect(result.success).toBe(false);
            expect(result.reason).toBe("already_host");
            done();
          });
        }
      });
    });

    test("should handle invalid quiz file", (done) => {
      // Set timeout for this test
      jest.setTimeout(15000);
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          hostSocket.emit("selectQuiz", {
            fileName: "non-existent.txt",
            shuffle: false,
            questionCount: null,
          });
        }
      });

      hostSocket.on("quizError", (error) => {
        expect(error.message).toBeDefined();
        done();
      });
    });

    test("should handle player with duplicate nickname", (done) => {
      // Set timeout for this test
      jest.setTimeout(15000);
      hostSocket.emit(
        "authenticateHost",
        process.env.HOST_PASSWORD || "rty6tedde",
      );

      hostSocket.on("hostAuthResult", (result) => {
        if (result.success) {
          // First player joins
          clientSocket.emit("join", "duplicate-name");
        }
      });

      clientSocket.on("playerListUpdate", () => {
        // Second player tries to join with same name
        const anotherPlayerSocket = require("socket.io-client")(
          `http://localhost:${server.address().port}`,
        );

        anotherPlayerSocket.emit("join", "duplicate-name");

        anotherPlayerSocket.on("joinError", (error) => {
          expect(error).toContain("уже занят");
          done();
        });
      });
    });
  });
});
