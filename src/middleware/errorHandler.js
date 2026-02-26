/**
 * Middleware для централизованной обработки ошибок
 */

/**
 * Стандартные типы ошибок
 */
const ERROR_TYPES = {
  VALIDATION: "VALIDATION_ERROR",
  AUTHENTICATION: "AUTHENTICATION_ERROR",
  AUTHORIZATION: "AUTHORIZATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL_ERROR",
  SOCKET: "SOCKET_ERROR",
};

/**
 * Создает объект ошибки с стандартной структурой
 * @param {string} type - тип ошибки
 * @param {string} message - сообщение об ошибке
 * @param {number} statusCode - HTTP статус код
 * @param {any} details - дополнительные детали ошибки
 * @returns {Object} объект ошибки
 */
function createError(type, message, statusCode = 500, details = null) {
  return {
    type,
    message,
    statusCode,
    details,
    timestamp: new Date().toISOString(),
    id: generateErrorId(),
  };
}

/**
 * Генерирует уникальный ID ошибки
 * @returns {string} уникальный ID
 */
function generateErrorId() {
  return "err_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Обработчик ошибок для Socket.IO
 * @param {Socket} socket - сокет клиента
 * @param {Error} error - объект ошибки
 * @param {string} context - контекст, где произошла ошибка
 */
function handleSocketError(socket, error, context = "unknown") {
  const errorObj = createError(ERROR_TYPES.SOCKET, error.message || "Произошла ошибка", 500, {
    context,
    stack: error.stack,
    socketId: socket.id,
    nickname: socket.nickname,
    isHost: socket.isHost,
  });

  console.error(`[Socket Error] ${context}:`, errorObj);

  // Отправляем ошибку клиенту
  socket.emit("error", {
    type: errorObj.type,
    message: errorObj.message,
    id: errorObj.id,
  });

  // Для ведущего отправляем более подробную информацию
  if (socket.isHost) {
    socket.emit("debugError", errorObj);
  }
}

/**
 * Валидатор для проверки результатов валидации
 * @param {Object} validation - результат валидации
 * @param {Socket} socket - сокет клиента
 * @param {string} context - контекст валидации
 * @returns {boolean} true если валидация прошла успешно
 */
function validateOrThrow(validation, socket, context) {
  if (!validation.isValid) {
    const error = createError(ERROR_TYPES.VALIDATION, validation.error, 400, {
      context,
      validation,
    });

    handleSocketError(socket, error, `Validation failed: ${context}`);
    return false;
  }
  return true;
}

/**
 * Обработчик асинхронных ошибок в сокет-обработчиках
 * @param {Function} asyncFn - асинхронная функция
 * @returns {Function} обернутая функция с обработкой ошибок
 */
function asyncErrorHandler(asyncFn) {
  return (socket, ...args) => {
    try {
      const result = asyncFn(socket, ...args);

      // Если функция возвращает Promise, обрабатываем его
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          handleSocketError(socket, error, asyncFn.name || "async function");
        });
      }
    } catch (error) {
      handleSocketError(socket, error, asyncFn.name || "sync function");
    }
  };
}

/**
 * Логгер ошибок
 * @param {Object} error - объект ошибки
 * @param {string} level - уровень логирования
 */
function logError(error, level = "error") {
  const logEntry = {
    level,
    timestamp: error.timestamp,
    errorId: error.id,
    type: error.type,
    message: error.message,
    details: error.details,
  };

  // В зависимости от уровня логирования
  switch (level) {
    case "error":
      console.error("[ERROR]", JSON.stringify(logEntry));
      break;
    case "warn":
      console.warn("[WARN]", JSON.stringify(logEntry));
      break;
    case "info":
      console.info("[INFO]", JSON.stringify(logEntry));
      break;
    default:
      console.error("[ERROR]", JSON.stringify(logEntry));
      break;
  }
}

/**
 * Обработчик необработанных ошибок
 * @param {Error} error - необработанная ошибка
 */
function handleUnhandledError(error) {
  const errorObj = createError(ERROR_TYPES.INTERNAL, "Необработанная ошибка", 500, {
    originalMessage: error.message,
    stack: error.stack,
  });

  logError(errorObj, "error");

  // В production режиме не показываем stack trace
  if (process.env.NODE_ENV !== "production") {
    console.error("Unhandled error details:", error);
  }
}

/**
 * Обработчик необработанных Promise rejection
 * @param {PromiseRejectionEvent} event - событие rejection
 */
function handleUnhandledRejection(event) {
  const errorObj = createError(ERROR_TYPES.INTERNAL, "Необработанный Promise rejection", 500, {
    reason: event.reason,
    promise: event.promise,
  });

  logError(errorObj, "error");
}

// Флаг для отслеживания инициализации
let isInitialized = false;
let boundHandleUnhandledError = null;
let boundHandleUnhandledRejection = null;

/**
 * Инициализация глобальных обработчиков ошибок
 */
function initGlobalErrorHandlers() {
  // Предотвращаем повторную инициализацию
  if (isInitialized) {
    return;
  }

  // Создаем привязанные обработчики для возможности удаления
  boundHandleUnhandledError = handleUnhandledError;
  boundHandleUnhandledRejection = handleUnhandledRejection;

  // Обработчик необработанных ошибок
  process.on("uncaughtException", boundHandleUnhandledError);

  // Обработчик необработанных Promise rejection
  process.on("unhandledRejection", boundHandleUnhandledRejection);

  isInitialized = true;
  console.log("Глобальные обработчики ошибок инициализированы");
}

/**
 * Удаление глобальных обработчиков ошибок (для тестов)
 */
function cleanupGlobalErrorHandlers() {
  if (isInitialized) {
    if (boundHandleUnhandledError) {
      process.removeListener("uncaughtException", boundHandleUnhandledError);
    }
    if (boundHandleUnhandledRejection) {
      process.removeListener("unhandledRejection", boundHandleUnhandledRejection);
    }
    isInitialized = false;
    boundHandleUnhandledError = null;
    boundHandleUnhandledRejection = null;
  }
}

/**
 * Сброс флага инициализации (только для тестов)
 */
function resetInitialization() {
  isInitialized = false;
  boundHandleUnhandledError = null;
  boundHandleUnhandledRejection = null;
}

/**
 * Middleware для Express (если понадобится в будущем)
 * @param {Error} err - объект ошибки
 * @param {Object} req - объект запроса
 * @param {Object} res - объект ответа
 * @param {Function} next - функция перехода к следующему middleware
 */
function expressErrorHandler(err, req, res, next) {
  const errorObj = createError(
    ERROR_TYPES.INTERNAL,
    err.message || "Произошла ошибка на сервере",
    err.statusCode || 500,
    {
      path: req.path,
      method: req.method,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    },
  );

  logError(errorObj, "error");

  res.status(errorObj.statusCode).json({
    success: false,
    error: {
      type: errorObj.type,
      message: errorObj.message,
      id: errorObj.id,
      ...(process.env.NODE_ENV === "development" && {
        details: errorObj.details,
      }),
    },
  });
}

module.exports = {
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
};
