/**
 * Middleware для валидации входящих данных
 */
const config = require("../../config");

/**
 * Валидация пароля ведущего
 * @param {string} password - пароль для проверки
 * @returns {Object} результат валидации
 */
function validateHostPassword(password) {
  if (!password || typeof password !== "string") {
    return {
      isValid: false,
      error: "Пароль должен быть строкой",
    };
  }

  if (password.trim().length === 0) {
    return {
      isValid: false,
      error: "Пароль не может быть пустым",
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Валидация ника игрока
 * @param {string} nickname - ник для проверки
 * @returns {Object} результат валидации
 */
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== "string") {
    return {
      isValid: false,
      error: "Никнейм должен быть строкой",
    };
  }

  const trimmed = nickname.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: "Никнейм не может быть пустым",
    };
  }

  if (trimmed.length > config.game.maxNicknameLength) {
    return {
      isValid: false,
      error: `Никнейм не может быть длиннее ${config.game.maxNicknameLength} символов`,
    };
  }

  // Проверка на недопустимые символы (разрешены буквы, цифры, пробелы, дефисы, подчеркивания)
  if (!/^[a-zA-ZА-Яа-яЁё0-9\s\-_]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: "Никнейм содержит недопустимые символы",
    };
  }

  return {
    isValid: true,
    value: trimmed,
  };
}

/**
 * Валидация индекса ответа
 * @param {number} answerIndex - индекс ответа
 * @param {number} maxOptions - максимальное количество вариантов
 * @returns {Object} результат валидации
 */
function validateAnswerIndex(answerIndex, maxOptions) {
  if (typeof answerIndex !== "number" || !Number.isInteger(answerIndex)) {
    return {
      isValid: false,
      error: "Индекс ответа должен быть целым числом",
    };
  }

  if (answerIndex < 0 || answerIndex >= maxOptions) {
    return {
      isValid: false,
      error: `Индекс ответа должен быть от 0 до ${maxOptions - 1}`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Валидация данных выбора квиза
 * @param {Object} data - данные выбора квиза
 * @returns {Object} результат валидации
 */
function validateQuizSelection(data) {
  const { fileName, shuffle, questionCount } = data;

  if (!fileName || typeof fileName !== "string") {
    return {
      isValid: false,
      error: "Имя файла квиза обязательно",
    };
  }

  if (!fileName.endsWith(".txt")) {
    return {
      isValid: false,
      error: "Файл квиза должен иметь расширение .txt",
    };
  }

  if (typeof shuffle !== "boolean") {
    return {
      isValid: false,
      error: "Параметр shuffle должен быть булевым значением",
    };
  }

  if (questionCount !== null && typeof questionCount !== "undefined") {
    if (typeof questionCount !== "number" || !Number.isInteger(questionCount)) {
      return {
        isValid: false,
        error: "Количество вопросов должно быть целым числом",
      };
    }

    if (questionCount <= 0) {
      return {
        isValid: false,
        error: "Количество вопросов должно быть больше 0",
      };
    }
  }

  return {
    isValid: true,
  };
}

/**
 * Валидация времени ответа
 * @param {number} timeElapsed - время ответа в секундах
 * @returns {Object} результат валидации
 */
function validateResponseTime(timeElapsed) {
  if (typeof timeElapsed !== "number" || timeElapsed < 0) {
    return {
      isValid: false,
      error: "Время ответа должно быть неотрицательным числом",
    };
  }

  if (timeElapsed > config.game.timeLimit * 4) {
    return {
      isValid: false,
      error: `Время ответа не может быть больше ${config.game.timeLimit * 4} секунд`,
    };
  }

  return {
    isValid: true,
  };
}

module.exports = {
  validateHostPassword,
  validateNickname,
  validateAnswerIndex,
  validateQuizSelection,
  validateResponseTime,
};
