const fs = require("fs").promises;
const path = require("path");

// Кэш загруженных квизов
const quizCache = new Map();

/**
 * Парсит текстовый файл с вопросами и возвращает массив вопросов
 * @param {string} fileName - имя файла в папке quizzes
 * @returns {Promise<Array>} массив вопросов с вариантами ответов
 */
async function loadQuizFile(fileName) {
  // Проверяем кэш
  if (quizCache.has(fileName)) {
    return quizCache.get(fileName);
  }

  const filePath = path.join(__dirname, "../../quizzes", fileName);
  const content = (await fs.readFile(filePath, "utf-8")).replace(/\r\n/g, "\n");
  const blocks = content.split("\n\n").filter((block) => block.trim() !== "");

  // Вспомогательная функция: извлекает текст и первое изображение из строки
  function parseContent(text) {
    const imgMatch = text.match(/\[img:(.*?)\]/);
    let imgSrc = null;
    let cleanText = text;

    if (imgMatch) {
      imgSrc = imgMatch[1].trim();
      if (!imgSrc.startsWith("http") && !imgSrc.startsWith("https")) {
        imgSrc = "/media/" + imgSrc;
      }
      // Удаляем ВСЕ [img:...] теги из текста, чтобы остался только чистый текст
      cleanText = text.replace(/\[img:.*?\]/g, "").trim();
    }

    return {
      text: cleanText,
      img: imgSrc, // null, если нет изображения
    };
  }

  const quizData = blocks.map((block) => {
    const lines = block.split("\n");

    // --- Вопрос ---
    let questionText = "";
    let questionImg = null;

    const questionLineFull = lines.find((line) =>
      line.trim().startsWith("Вопрос:"),
    );
    if (questionLineFull) {
      const afterPrefix = questionLineFull.trim().substring("Вопрос:".length);
      const parsedQ = parseContent(afterPrefix);
      questionText = parsedQ.text;
      questionImg = parsedQ.img;
    }

    // --- Варианты ---
    const options = [];
    const optionsStartIndex = lines.findIndex(
      (line) => line.trim() === "Варианты:",
    );
    if (optionsStartIndex !== -1) {
      for (let i = optionsStartIndex + 1; i < lines.length; i++) {
        const line = lines[i].trimEnd(); // не удаляем начальные пробелы — текст может начинаться с них
        if (line.trim().startsWith("Ответ:")) break;

        // Передаём исходную строку (без trim'а слева, но с trim'ом справа)
        // Если строка пустая — оставляем пустой текст
        const rawOptionLine = lines[i].endsWith("\n") ? lines[i] : lines[i]; // просто берём как есть
        const parsedOpt = parseContent(rawOptionLine);
        options.push({
          text: parsedOpt.text,
          img: parsedOpt.img,
        });
      }
    }

    // --- Правильный ответ ---
    let correct = -1;
    const answerLine = lines.find((line) => line.trim().startsWith("Ответ:"));
    if (answerLine) {
      const answerNum = parseInt(
        answerLine.trim().substring("Ответ:".length).trim(),
        10,
      );
      // Преобразуем нумерацию из "с 1" в индекс "с 0"
      correct = isNaN(answerNum) ? -1 : answerNum - 1;
    }

    return {
      question: questionText,
      questionImg: questionImg,
      options: options,
      correct: correct,
    };
  });

  // Сохраняем в кэш
  quizCache.set(fileName, quizData);

  return quizData;
}

/**
 * Синхронная версия для обратной совместимости
 * @param {string} fileName - имя файла в папке quizzes
 * @returns {Array} массив вопросов с вариантами ответов
 */
function loadQuizFileSync(fileName) {
  // Проверяем кэш
  if (quizCache.has(fileName)) {
    return quizCache.get(fileName);
  }

  const fsSync = require("fs");
  const filePath = path.join(__dirname, "../../quizzes", fileName);
  const content = fsSync.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const blocks = content.split("\n\n").filter((block) => block.trim() !== "");

  // Вспомогательная функция: извлекает текст и первое изображение из строки
  function parseContent(text) {
    const imgMatch = text.match(/\[img:(.*?)\]/);
    let imgSrc = null;
    let cleanText = text;

    if (imgMatch) {
      imgSrc = imgMatch[1].trim();
      if (!imgSrc.startsWith("http") && !imgSrc.startsWith("https")) {
        imgSrc = "/media/" + imgSrc;
      }
      cleanText = text.replace(/\[img:.*?\]/g, "").trim();
    }

    return {
      text: cleanText,
      img: imgSrc,
    };
  }

  const quizData = blocks.map((block) => {
    const lines = block.split("\n");

    let questionText = "";
    let questionImg = null;

    const questionLineFull = lines.find((line) =>
      line.trim().startsWith("Вопрос:"),
    );
    if (questionLineFull) {
      const afterPrefix = questionLineFull.trim().substring("Вопрос:".length);
      const parsedQ = parseContent(afterPrefix);
      questionText = parsedQ.text;
      questionImg = parsedQ.img;
    }

    const options = [];
    const optionsStartIndex = lines.findIndex(
      (line) => line.trim() === "Варианты:",
    );
    if (optionsStartIndex !== -1) {
      for (let i = optionsStartIndex + 1; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        if (line.trim().startsWith("Ответ:")) break;

        const rawOptionLine = lines[i].endsWith("\n") ? lines[i] : lines[i];
        const parsedOpt = parseContent(rawOptionLine);
        options.push({
          text: parsedOpt.text,
          img: parsedOpt.img,
        });
      }
    }

    let correct = -1;
    const answerLine = lines.find((line) => line.trim().startsWith("Ответ:"));
    if (answerLine) {
      const answerNum = parseInt(
        answerLine.trim().substring("Ответ:".length).trim(),
        10,
      );
      correct = isNaN(answerNum) ? -1 : answerNum - 1;
    }

    return {
      question: questionText,
      questionImg: questionImg,
      options: options,
      correct: correct,
    };
  });

  // Сохраняем в кэш
  quizCache.set(fileName, quizData);

  return quizData;
}

/**
 * Очищает кэш квизов
 * @param {string} [fileName] - имя файла для очистки (если не указан, очищает весь кэш)
 */
function clearCache(fileName) {
  if (fileName) {
    quizCache.delete(fileName);
  } else {
    quizCache.clear();
  }
}

/**
 * Перемешивает массив случайным образом
 * @param {Array} array - массив для перемешивания
 * @returns {Array} новый перемешанный массив
 */
function shuffleArray(array) {
  const shuffled = [...array]; // копируем, чтобы не мутировать оригинал
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  loadQuizFile: loadQuizFileSync, // Для обратной совместимости
  loadQuizFileAsync: loadQuizFile,
  loadQuizFileSync,
  shuffleArray,
  clearCache,
};
