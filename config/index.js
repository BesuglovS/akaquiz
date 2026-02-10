/**
 * Конфигурационный модуль
 * Загружает настройки из JSON файлов с возможностью оверрайда через environment variables
 */

const fs = require("fs");
const path = require("path");

/**
 * Загружает конфигурацию из JSON файла
 * @param {string} env - имя окружения (development, production и т.д.)
 * @returns {Object} объект конфигурации
 */
function loadConfig(env = "default") {
  try {
    const configPath = path.join(__dirname, `${env}.json`);

    if (!fs.existsSync(configPath)) {
      console.warn(
        `Конфигурационный файл ${configPath} не найден, используем default.json`,
      );
      return loadConfig("default");
    }

    const configData = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configData);

    // Применяем environment variables если они есть
    return applyEnvironmentOverrides(config);
  } catch (error) {
    console.error(`Ошибка загрузки конфигурации: ${error.message}`);
    return getDefaultConfig();
  }
}

/**
 * Применяет оверрайды из environment variables
 * @param {Object} config - базовая конфигурация
 * @returns {Object} конфигурация с оверрайдами
 */
function applyEnvironmentOverrides(config) {
  const envConfig = { ...config };

  // Server overrides
  if (process.env.PORT) {
    envConfig.server.port = parseInt(process.env.PORT, 10);
  }
  if (process.env.HOST) {
    envConfig.server.host = process.env.HOST;
  }
  if (process.env.NODE_ENV) {
    envConfig.environment = process.env.NODE_ENV;
  }

  // Security overrides
  if (process.env.HOST_PASSWORD) {
    envConfig.security.hostPassword = process.env.HOST_PASSWORD;
  }

  // Game overrides
  if (process.env.TIME_LIMIT) {
    envConfig.game.timeLimit = parseInt(process.env.TIME_LIMIT, 10);
  }
  if (process.env.MAX_NICKNAME_LENGTH) {
    envConfig.game.maxNicknameLength = parseInt(
      process.env.MAX_NICKNAME_LENGTH,
      10,
    );
  }
  if (process.env.MIN_NICKNAME_LENGTH) {
    envConfig.game.minNicknameLength = parseInt(
      process.env.MIN_NICKNAME_LENGTH,
      10,
    );
  }

  // Paths overrides
  if (process.env.QUIZZES_PATH) {
    envConfig.paths.quizzes = process.env.QUIZZES_PATH;
  }
  if (process.env.PUBLIC_PATH) {
    envConfig.paths.public = process.env.PUBLIC_PATH;
  }

  // Logging overrides
  if (process.env.LOG_LEVEL) {
    envConfig.logging.level = process.env.LOG_LEVEL;
  }
  if (process.env.ENABLE_CONSOLE_LOGGING) {
    envConfig.logging.enableConsole =
      process.env.ENABLE_CONSOLE_LOGGING === "true";
  }
  if (process.env.ENABLE_FILE_LOGGING) {
    envConfig.logging.enableFile = process.env.ENABLE_FILE_LOGGING === "true";
  }

  return envConfig;
}

/**
 * Возвращает дефолтную конфигурацию
 * @returns {Object} дефолтная конфигурация
 */
function getDefaultConfig() {
  return {
    server: {
      port: 80,
      host: "0.0.0.0",
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    },
    game: {
      timeLimit: 15,
      maxNicknameLength: 20,
      minNicknameLength: 2,
      maxPlayers: 100,
      shuffleQuestions: true,
      defaultQuestionCount: 10,
    },
    security: {
      hostPassword: "rty6tedde",
      maxLoginAttempts: 3,
      sessionTimeout: 3600000,
    },
    paths: {
      quizzes: "./quizzes",
      public: "./public",
      uploads: "./uploads",
    },
    logging: {
      level: "info",
      enableConsole: true,
      enableFile: false,
      logFile: "./logs/server.log",
    },
    features: {
      analytics: true,
      csvExport: true,
      darkTheme: true,
      imageSupport: true,
    },
  };
}

/**
 * Валидация конфигурации
 * @param {Object} config - конфигурация для валидации
 * @returns {Object} результат валидации
 */
function validateConfig(config) {
  const errors = [];

  // Валидация server.port
  if (
    !Number.isInteger(config.server.port) ||
    config.server.port <= 0 ||
    config.server.port > 65535
  ) {
    errors.push("server.port должен быть целым числом от 1 до 65535");
  }

  // Валидация game.timeLimit
  if (!Number.isInteger(config.game.timeLimit) || config.game.timeLimit <= 0) {
    errors.push("game.timeLimit должен быть положительным целым числом");
  }

  // Валидация game.maxNicknameLength
  if (
    !Number.isInteger(config.game.maxNicknameLength) ||
    config.game.maxNicknameLength <= 0
  ) {
    errors.push(
      "game.maxNicknameLength должен быть положительным целым числом",
    );
  }

  // Валидация game.minNicknameLength
  if (
    !Number.isInteger(config.game.minNicknameLength) ||
    config.game.minNicknameLength <= 0
  ) {
    errors.push(
      "game.minNicknameLength должен быть положительным целым числом",
    );
  }

  // Проверка соотношения min/max длины никнейма
  if (config.game.minNicknameLength >= config.game.maxNicknameLength) {
    errors.push(
      "game.minNicknameLength должен быть меньше game.maxNicknameLength",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Загружаем конфигурацию при инициализации модуля
const config = loadConfig(process.env.NODE_ENV || "default");
const validation = validateConfig(config);

if (!validation.isValid) {
  console.error("Ошибки в конфигурации:");
  validation.errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

module.exports = config;
