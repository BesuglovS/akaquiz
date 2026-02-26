const {
  ERROR_TYPES,
  createError,
  handleSocketError,
  validateOrThrow,
  asyncErrorHandler,
  logError,
  initGlobalErrorHandlers,
  cleanupGlobalErrorHandlers,
  resetInitialization,
  handleUnhandledError,
  handleUnhandledRejection,
  expressErrorHandler,
} = require("../../../src/middleware/errorHandler");

// Mock console methods
const originalConsole = console;

describe("errorHandler middleware", () => {
  let mockSocket;
  let consoleSpy;

  beforeEach(() => {
    mockSocket = {
      id: "test-socket-id",
      nickname: "test-user",
      isHost: false,
      emit: jest.fn(),
    };

    consoleSpy = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
    };

    // Mock console methods
    global.console = consoleSpy;
  });

  afterEach(() => {
    // Restore original console
    global.console = originalConsole;
    // Cleanup global error handlers to prevent memory leak warnings
    cleanupGlobalErrorHandlers();
    // Reset initialization flag for next test
    resetInitialization();
  });

  describe("ERROR_TYPES", () => {
    test("should have all expected error types", () => {
      expect(ERROR_TYPES).toEqual({
        VALIDATION: "VALIDATION_ERROR",
        AUTHENTICATION: "AUTHENTICATION_ERROR",
        AUTHORIZATION: "AUTHORIZATION_ERROR",
        NOT_FOUND: "NOT_FOUND",
        INTERNAL: "INTERNAL_ERROR",
        SOCKET: "SOCKET_ERROR",
      });
    });
  });

  describe("createError", () => {
    test("should create error with all required fields", () => {
      const error = createError(ERROR_TYPES.VALIDATION, "Test error message", 400, {
        field: "test",
      });

      expect(error).toEqual({
        type: ERROR_TYPES.VALIDATION,
        message: "Test error message",
        statusCode: 400,
        details: { field: "test" },
        timestamp: expect.any(String),
        id: expect.any(String),
      });
    });

    test("should create error with default status code", () => {
      const error = createError(ERROR_TYPES.INTERNAL, "Internal error");

      expect(error.statusCode).toBe(500);
      expect(error.details).toBeNull();
    });

    test("should generate unique IDs", () => {
      const error1 = createError(ERROR_TYPES.VALIDATION, "Error 1");
      const error2 = createError(ERROR_TYPES.VALIDATION, "Error 2");

      expect(error1.id).not.toBe(error2.id);
    });
  });

  describe("handleSocketError", () => {
    test("should emit error to socket", () => {
      const error = new Error("Test error");

      handleSocketError(mockSocket, error, "test context");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        type: ERROR_TYPES.SOCKET,
        message: "Test error",
        id: expect.any(String),
      });
    });

    test("should emit debug error to host socket", () => {
      mockSocket.isHost = true;
      const error = new Error("Test error");

      handleSocketError(mockSocket, error, "test context");

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "debugError",
        expect.objectContaining({
          type: ERROR_TYPES.SOCKET,
          message: "Test error",
          details: expect.objectContaining({
            context: "test context",
            stack: expect.any(String),
            socketId: "test-socket-id",
            nickname: "test-user",
            isHost: true,
          }),
        }),
      );
    });

    test("should not emit debug error to non-host socket", () => {
      mockSocket.isHost = false;
      const error = new Error("Test error");

      handleSocketError(mockSocket, error, "test context");

      const emitCalls = mockSocket.emit.mock.calls;
      const debugErrorCall = emitCalls.find((call) => call[0] === "debugError");

      expect(debugErrorCall).toBeUndefined();
    });

    test("should log error with correct format", () => {
      const error = new Error("Test error");

      handleSocketError(mockSocket, error, "test context");

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("[Socket Error] test context:"),
        expect.objectContaining({
          type: ERROR_TYPES.SOCKET,
          message: "Test error",
        }),
      );
    });
  });

  describe("validateOrThrow", () => {
    test("should return true for valid validation", () => {
      const validation = { isValid: true };

      const result = validateOrThrow(validation, mockSocket, "test validation");

      expect(result).toBe(true);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    test("should return false and emit error for invalid validation", () => {
      const validation = {
        isValid: false,
        error: "Validation failed",
      };

      const result = validateOrThrow(validation, mockSocket, "test validation");

      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        type: ERROR_TYPES.SOCKET,
        message: "Validation failed",
        id: expect.any(String),
      });
    });
  });

  describe("asyncErrorHandler", () => {
    test("should handle sync function errors", () => {
      const mockFn = jest.fn().mockImplementation(() => {
        throw new Error("Sync error");
      });
      const wrappedFn = asyncErrorHandler(mockFn);

      wrappedFn(mockSocket, "arg1", "arg2");

      expect(mockFn).toHaveBeenCalledWith(mockSocket, "arg1", "arg2");
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        type: ERROR_TYPES.SOCKET,
        message: "Sync error",
        id: expect.any(String),
      });
    });

    test("should handle async function errors", (done) => {
      const mockAsyncFn = jest.fn().mockImplementation(() => {
        return Promise.reject(new Error("Async error"));
      });
      const wrappedFn = asyncErrorHandler(mockAsyncFn);

      wrappedFn(mockSocket, "arg1", "arg2");

      setTimeout(() => {
        expect(mockAsyncFn).toHaveBeenCalledWith(mockSocket, "arg1", "arg2");
        expect(mockSocket.emit).toHaveBeenCalledWith("error", {
          type: ERROR_TYPES.SOCKET,
          message: "Async error",
          id: expect.any(String),
        });
        done();
      }, 10);
    });

    test("should handle successful async function", (done) => {
      const mockAsyncFn = jest.fn().mockImplementation(() => {
        return Promise.resolve("success");
      });
      const wrappedFn = asyncErrorHandler(mockAsyncFn);

      wrappedFn(mockSocket, "arg1", "arg2");

      setTimeout(() => {
        expect(mockAsyncFn).toHaveBeenCalledWith(mockSocket, "arg1", "arg2");
        expect(mockSocket.emit).not.toHaveBeenCalled();
        done();
      }, 10);
    });
  });

  describe("logError", () => {
    test("should log error with info level", () => {
      const error = createError(ERROR_TYPES.VALIDATION, "Test error");

      logError(error, "info");

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining("[INFO]"),
        expect.stringMatching(
          /{"level":"info","timestamp":".*","errorId":"err_[a-z0-9]+","type":"VALIDATION_ERROR","message":"Test error","details":null}/,
        ),
      );
    });

    test("should log error with warn level", () => {
      const error = createError(ERROR_TYPES.VALIDATION, "Test error");

      logError(error, "warn");

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining("[WARN]"),
        expect.stringMatching(
          /{"level":"warn","timestamp":".*","errorId":"err_[a-z0-9]+","type":"VALIDATION_ERROR","message":"Test error","details":null}/,
        ),
      );
    });

    test("should log error with error level", () => {
      const error = createError(ERROR_TYPES.VALIDATION, "Test error");

      logError(error, "error");

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("[ERROR]"),
        expect.stringMatching(
          /{"level":"error","timestamp":".*","errorId":"err_[a-z0-9]+","type":"VALIDATION_ERROR","message":"Test error","details":null}/,
        ),
      );
    });

    test("should log error with default level", () => {
      const error = createError(ERROR_TYPES.VALIDATION, "Test error");

      logError(error);

      // Default level is "error", so console.error should be called with [ERROR]
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("[ERROR]"),
        expect.stringMatching(
          /{"level":"error","timestamp":".*","errorId":"err_[a-z0-9]+","type":"VALIDATION_ERROR","message":"Test error","details":null}/,
        ),
      );
    });
  });

  describe("initGlobalErrorHandlers", () => {
    test("should not throw when called", () => {
      expect(() => {
        initGlobalErrorHandlers();
      }).not.toThrow();
    });

    test("should log initialization message", () => {
      initGlobalErrorHandlers();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining("Глобальные обработчики ошибок инициализированы"),
      );
    });

    test("should not add duplicate handlers when called multiple times", () => {
      // First call
      initGlobalErrorHandlers();
      const listenerCountAfterFirst = process.listenerCount("uncaughtException");

      // Second call - should not add more listeners
      initGlobalErrorHandlers();
      const listenerCountAfterSecond = process.listenerCount("uncaughtException");

      expect(listenerCountAfterFirst).toBe(listenerCountAfterSecond);
    });
  });

  describe("cleanupGlobalErrorHandlers", () => {
    test("should remove event listeners when called after initialization", () => {
      initGlobalErrorHandlers();
      const listenerCountAfterInit = process.listenerCount("uncaughtException");

      cleanupGlobalErrorHandlers();
      const listenerCountAfterCleanup = process.listenerCount("uncaughtException");

      expect(listenerCountAfterCleanup).toBeLessThan(listenerCountAfterInit);
    });

    test("should not throw when called without initialization", () => {
      expect(() => {
        cleanupGlobalErrorHandlers();
      }).not.toThrow();
    });

    test("should allow re-initialization after cleanup", () => {
      initGlobalErrorHandlers();
      cleanupGlobalErrorHandlers();

      // Should be able to initialize again
      expect(() => {
        initGlobalErrorHandlers();
      }).not.toThrow();
    });
  });

  describe("resetInitialization", () => {
    test("should reset initialization flag", () => {
      initGlobalErrorHandlers();
      cleanupGlobalErrorHandlers();
      resetInitialization();

      // Should be able to initialize again and log message
      initGlobalErrorHandlers();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining("Глобальные обработчики ошибок инициализированы"),
      );
    });
  });

  describe("handleUnhandledError", () => {
    test("should log unhandled error in development mode", () => {
      process.env.NODE_ENV = "development";

      // Trigger the handler directly
      const error = new Error("Test unhandled error");
      handleUnhandledError(error);

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    test("should not log stack trace in production mode", () => {
      process.env.NODE_ENV = "production";

      const error = new Error("Test unhandled error");
      handleUnhandledError(error);

      // Should call error for logError, but not for "Unhandled error details"
      const errorCalls = consoleSpy.error.mock.calls;
      const hasUnhandledDetails = errorCalls.some((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("Unhandled error details")),
      );
      expect(hasUnhandledDetails).toBe(false);
    });
  });

  describe("handleUnhandledRejection", () => {
    test("should log unhandled rejection", () => {
      const event = {
        reason: "Test rejection reason",
        promise: Promise.resolve(),
      };

      handleUnhandledRejection(event);

      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe("expressErrorHandler", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        path: "/test/path",
        method: "POST",
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    test("should handle error with default status code", () => {
      const err = new Error("Test express error");

      expressErrorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            type: ERROR_TYPES.INTERNAL,
            message: "Test express error",
          }),
        }),
      );
    });

    test("should handle error with custom status code", () => {
      const err = new Error("Not found");
      err.statusCode = 404;

      expressErrorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test("should include stack trace in development mode", () => {
      process.env.NODE_ENV = "development";
      const err = new Error("Dev error");

      expressErrorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              path: "/test/path",
              method: "POST",
              stack: expect.any(String),
            }),
          }),
        }),
      );
    });

    test("should not include stack trace in production mode", () => {
      process.env.NODE_ENV = "production";
      const err = new Error("Prod error");

      expressErrorHandler(err, mockReq, mockRes, mockNext);

      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.error.details).toBeUndefined();
    });

    test("should use default message when error has no message", () => {
      const err = new Error();

      expressErrorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: "Произошла ошибка на сервере",
          }),
        }),
      );
    });
  });
});
