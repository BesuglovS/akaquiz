/**
 * Клиентский скрипт для ведущего
 */
(function () {
  const socket = io();

  const authScreen = document.getElementById("auth-screen");
  const mainInterface = document.getElementById("main-interface");
  const passwordInput = document.getElementById("host-password");
  const submitBtn = document.getElementById("submit-password");
  const errorMsg = document.getElementById("auth-error");

  // Элементы
  const setupArea = document.getElementById("setup-area");
  const lobby = document.getElementById("lobby");
  const gameArea = document.getElementById("game-area");
  const leaderboardArea = document.getElementById("leaderboard-area");
  const analyticsArea = document.getElementById("analytics-area");

  const quizSelect = document.getElementById("quiz-select");
  const loadBtn = document.getElementById("load-btn");
  const nextBtn = document.getElementById("next-btn");
  const qArea = document.getElementById("question-area");
  const timerDisp = document.getElementById("timer-display");
  const statsCont = document.getElementById("stats-container");
  const playerNamesDiv = document.getElementById("player-names");
  const playerCountSpan = document.getElementById("player-count-badge");

  /**
   * Показывает ошибку
   */
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hidden");
  }

  /**
   * Показывает индикатор загрузки
   */
  function showLoadingIndicator(button, text) {
    button.innerHTML = `
      <span class="loading-spinner"></span>
      <span class="loading-text">${text}</span>
    `;
    button.disabled = true;
  }

  /**
   * Показывает UI переподключения
   */
  function showReconnectUI() {
    const existingOverlay = document.getElementById("reconnect-overlay");
    if (existingOverlay) return;

    const overlay = document.createElement("div");
    overlay.id = "reconnect-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      font-family: 'Inter', sans-serif;
    `;
    overlay.innerHTML = `
      <div class="spinner" style="width: 50px; height: 50px; margin-bottom: 20px;"></div>
      <h3>Соединение потеряно</h3>
      <p>Попытка переподключения...</p>
    `;
    document.body.appendChild(overlay);
  }

  /**
   * Скрывает UI переподключения
   */
  function hideReconnectUI() {
    const overlay = document.getElementById("reconnect-overlay");
    if (overlay) {
      overlay.remove();
    }
  }

  // === Аутентификация ===

  submitBtn.onclick = () => {
    const pwd = passwordInput.value.trim();
    if (!pwd) {
      showError("Введите пароль");
      return;
    }
    showLoadingIndicator(submitBtn, "Проверка...");
    socket.emit("authenticateHost", pwd);
  };

  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submitBtn.click();
  });

  socket.on("hostAuthResult", (result) => {
    if (result.success) {
      authScreen.classList.add("hidden");
      mainInterface.classList.remove("hidden");
      socket.emit("getQuizList");
    } else {
      if (result.reason === "already_host") {
        showError("Ведущий уже подключён!");
      } else if (result.reason === "server_config_error") {
        showError("Ошибка конфигурации сервера. Обратитесь к администратору.");
      } else {
        showError("Неверный пароль. Попробуйте снова.");
        passwordInput.value = "";
        passwordInput.focus();
      }
    }
  });

  // === События ===

  socket.on("quizList", (files) => {
    quizSelect.innerHTML = files.map((f) => `<option value="${f}">${f}</option>`).join("");
  });

  socket.on("playerListUpdate", (players) => {
    playerCountSpan.innerText = players.length;
    if (players.length > 0) {
      playerNamesDiv.innerHTML = players
        .map((name) => `<div class="player-chip">${name}</div>`)
        .join("");
    }
  });

  loadBtn.onclick = () => {
    const fileName = quizSelect.value;
    if (!fileName) return;

    showLoadingIndicator(loadBtn, "Загрузка...");
    loadBtn.classList.add("pulse-animation");

    const shouldShuffle = document.getElementById("shuffle-questions").checked;

    const countInput = document.getElementById("question-count");
    let questionCount = null;
    if (countInput.value.trim() !== "") {
      const num = parseInt(countInput.value.trim(), 10);
      if (num > 0) questionCount = num;
    }

    const timeLimit = parseInt(document.getElementById("time-limit").value, 10);

    socket.emit("selectQuiz", {
      fileName,
      shuffle: shouldShuffle,
      questionCount,
      timeLimit,
    });
  };

  socket.on("quizReady", (fileName) => {
    loadBtn.innerText = "✅ Загружено: " + fileName;
    loadBtn.classList.add("success");

    const startBtn = document.getElementById("start-game-btn");
    startBtn.disabled = false;
    startBtn.innerText = "Начать квиз: " + fileName;
    startBtn.style.animation = "pulse 1.5s infinite";
  });

  socket.on("quizError", (data) => {
    loadBtn.innerText = "❌ Ошибка загрузки";
    loadBtn.classList.remove("success");
    alert("Ошибка загрузки квиза: " + data.message);
  });

  // Старт игры
  document.getElementById("start-game-btn").onclick = () => socket.emit("nextQuestion");
  nextBtn.onclick = () => socket.emit("nextQuestion");

  // Пауза игры
  const pauseBtn = document.getElementById("pause-btn");
  pauseBtn.onclick = () => {
    socket.emit("togglePause");
  };

  socket.on("gamePaused", () => {
    pauseBtn.innerHTML = "▶️ Продолжить";
    pauseBtn.classList.remove("secondary");
    pauseBtn.classList.add("primary");
  });

  socket.on("gameResumed", (data) => {
    pauseBtn.innerHTML = "⏸️ Пауза";
    pauseBtn.classList.remove("primary");
    pauseBtn.classList.add("secondary");
    if (data && data.timeLeft) {
      timerDisp.innerText = data.timeLeft;
    }
  });

  socket.on("updateQuestion", (data) => {
    setupArea.classList.add("hidden");
    lobby.classList.add("hidden");
    gameArea.classList.remove("hidden");

    qArea.innerHTML = `
      <div class="question-title fade-in">${data.question}</div>
      ${
        data.questionImg ? `<img src="${data.questionImg}" class="main-question-img slide-in">` : ""
      }
    `;

    renderStats(data.options);

    nextBtn.innerText = "Остановить время";
    nextBtn.classList.remove("secondary");
    nextBtn.classList.add("primary");

    document.getElementById("q-num").textContent = data.questionNumber;
    document.getElementById("q-total").textContent = data.totalQuestions;
  });

  socket.on("timerTick", (time) => {
    timerDisp.innerText = time;
    timerDisp.style.borderColor = time <= 5 ? "#e74c3c" : "#6c5ce7";
  });

  socket.on("updateStats", (votes) => {
    const bars = document.querySelectorAll(".bar-fill");
    bars.forEach((bar, index) => {
      const count = votes[index] || 0;
      const targetHeight = `${Math.min(count * 20, 100)}%`;

      bar.style.transition = "height 0.5s ease-out";
      bar.style.height = targetHeight;
      bar.setAttribute("data-count", count);

      if (count > 0) {
        bar.style.animation = "bounce 0.5s ease-out";
        setTimeout(() => {
          bar.style.animation = "";
        }, 500);
      }
    });
  });

  function renderStats(options) {
    statsCont.innerHTML = options
      .map(
        (opt, i) => `
          <div class="stat-column">
            <div class="bar-wrapper">
              <div class="bar-fill" style="height: 0%" data-count="0"></div>
            </div>
            <div class="bar-label">
              ${
                opt.img
                  ? `<img src="${opt.img}" style="width:30px; height:30px; object-fit:cover; border-radius:4px; display:block; margin:0 auto 5px;">`
                  : ""
              }
              ${opt.text}
            </div>
          </div>
        `,
      )
      .join("");
  }

  socket.on("timeOver", (data) => {
    nextBtn.innerText = "Следующий вопрос →";
    leaderboardArea.classList.remove("hidden");
    updateLeaderboard(data.scores);

    nextBtn.classList.remove("primary");
    nextBtn.classList.add("secondary");

    analyticsArea.classList.remove("hidden");
    showQuestionAnalytics();
  });

  socket.on("quizFinished", (scores) => {
    qArea.innerHTML = "🏁 Квиз завершен! Поздравляем победителей!";
    nextBtn.classList.add("hidden");
    document.getElementById("reset-btn").classList.remove("hidden");
    updateLeaderboard(scores);
    analyticsArea.classList.remove("hidden");
    showOverallAnalytics();
  });

  function updateLeaderboard(scores) {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const list = document.getElementById("leaderboard-list");

    if (Object.keys(scores).length === 0) {
      list.innerHTML = "<li>Ждем подключения игроков...</li>";
      return;
    }

    list.innerHTML = sorted
      .map(([name, val], i) => {
        let placeClass = "";
        if (i === 0 && val > 0) placeClass = "place-1 winner-anim";
        else if (i === 1 && val > 0) placeClass = "place-2";
        else if (i === 2 && val > 0) placeClass = "place-3";

        return `
          <li class="rank-item ${placeClass}">
            <span class="rank-icon"></span>
            <span class="rank">${i + 1}</span>
            <span class="name">${name}</span>
            <span class="score">${val}</span>
          </li>`;
      })
      .join("");
  }

  const resetBtn = document.getElementById("reset-btn");

  resetBtn.onclick = () => {
    socket.emit("resetGame");
    location.reload();
  };

  // === Аналитика ===

  const analyticsContent = document.getElementById("analytics-content");
  const showOverallBtn = document.getElementById("show-overall-analytics");
  const showQuestionBtn = document.getElementById("show-question-analytics");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportXlsxBtn = document.getElementById("export-xlsx-btn");

  showOverallBtn.onclick = () => {
    showOverallAnalytics();
    showOverallBtn.classList.add("active");
    showQuestionBtn.classList.remove("active");
  };

  showQuestionBtn.onclick = () => {
    showQuestionAnalytics();
    showQuestionBtn.classList.add("active");
    showOverallBtn.classList.remove("active");
  };

  exportCsvBtn.onclick = () => {
    exportCsvBtn.disabled = true;
    exportCsvBtn.innerText = "Экспорт...";
    socket.emit("exportResults", "csv");
  };

  exportXlsxBtn.onclick = () => {
    exportXlsxBtn.disabled = true;
    exportXlsxBtn.innerText = "Экспорт...";
    socket.emit("exportResults", "xlsx");
  };

  function showOverallAnalytics() {
    socket.emit("getAnalytics");
  }

  function showQuestionAnalytics() {
    socket.emit("getQuestionAnalytics", -1);
  }

  socket.on("analyticsData", (data) => {
    const accuracy =
      data.totalAnswers > 0 ? ((data.correctAnswers / data.totalAnswers) * 100).toFixed(1) : 0;

    analyticsContent.innerHTML = `
      <div class="analytics-grid">
        <div class="analytics-card">
          <h4>📊 Общая статистика</h4>
          <div class="metric">
            <span class="metric-label">Всего ответов:</span>
            <span class="metric-value">${data.totalAnswers}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Правильных ответов:</span>
            <span class="metric-value correct">${data.correctAnswers}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Процент правильных:</span>
            <span class="metric-value">${accuracy}%</span>
          </div>
          <div class="metric">
            <span class="metric-label">Среднее время ответа:</span>
            <span class="metric-value">${data.averageResponseTime.toFixed(2)} с</span>
          </div>
        </div>
        <div class="analytics-card">
          <h4>⏱️ Распределение времени</h4>
          ${renderTimeDistribution(data.responseTimeDistribution)}
        </div>
      </div>
    `;
  });

  socket.on("questionAnalyticsData", (data) => {
    const accuracy =
      data.totalAnswers > 0 ? ((data.correctAnswers / data.totalAnswers) * 100).toFixed(1) : 0;

    analyticsContent.innerHTML = `
      <div class="analytics-card">
        <div class="metric">
          <span class="metric-label">Ответов на вопрос:</span>
          <span class="metric-value">${data.totalAnswers}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Правильных ответов:</span>
          <span class="metric-value correct">${data.correctAnswers}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Процент правильных:</span>
          <span class="metric-value">${accuracy}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Среднее время ответа:</span>
          <span class="metric-value">${data.averageResponseTime.toFixed(2)} с</span>
        </div>
        <div class="metric">
          <span class="metric-label">Время ответов:</span>
          <span class="metric-value">${data.responseTimes
            .map((t) => t.toFixed(2))
            .join(", ")} с</span>
        </div>
      </div>
    `;
  });

  socket.on("csvExportReady", (csvContent) => {
    exportCsvBtn.disabled = false;
    exportCsvBtn.innerText = "📊 Экспорт в CSV";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `quiz_results_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    analyticsContent.innerHTML = `
      <div class="analytics-card">
        <h4>✅ Экспорт завершен</h4>
        <p>Файл CSV успешно загружен на ваш компьютер.</p>
      </div>
    `;
  });

  socket.on("xlsxExportReady", (data) => {
    exportXlsxBtn.disabled = false;
    exportXlsxBtn.innerText = "📈 Экспорт в Excel";

    try {
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const mimeType =
        data.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const blob = new Blob([bytes], { type: mimeType });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", data.filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      analyticsContent.innerHTML = `
        <div class="analytics-card">
          <h4>✅ Экспорт завершен</h4>
          <p>Файл Excel успешно загружен на ваш компьютер.</p>
          <p class="metric-label">Имя файла: ${data.filename}</p>
        </div>
      `;
    } catch (error) {
      console.error("Ошибка при загрузке Excel файла:", error);
      analyticsContent.innerHTML = `
        <div class="analytics-card">
          <h4>❌ Ошибка экспорта</h4>
          <p>Не удалось загрузить файл Excel. Попробуйте снова.</p>
          <button onclick="location.reload()" class="btn secondary">Перезагрузить страницу</button>
        </div>
      `;
    }
  });

  function renderTimeDistribution(times) {
    if (times.length === 0) {
      return "<p>Нет данных о времени ответов</p>";
    }

    const maxTime = Math.max(...times);
    const bins = 5;
    const binSize = maxTime / bins;
    const distribution = Array(bins).fill(0);

    times.forEach((time) => {
      const binIndex = Math.min(Math.floor(time / binSize), bins - 1);
      distribution[binIndex]++;
    });

    return `
      <div class="time-chart">
        ${distribution
          .map((count, index) => {
            const start = (index * binSize).toFixed(1);
            const end = ((index + 1) * binSize).toFixed(1);
            const percentage = ((count / times.length) * 100).toFixed(0);
            return `
              <div class="time-bin">
                <span class="bin-label">${start}-${end}с</span>
                <div class="bin-bar">
                  <div class="bin-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="bin-count">${count} ответов (${percentage}%)</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  // === Конфигурация ===

  socket.emit("getConfig");

  socket.on("configData", (config) => {
    const questionCountSelect = document.getElementById("question-count");
    const questionOptions = config.game.questionCountOptions || ["Все", 5, 10, 15, 20, 25, 30];
    const defaultQuestionCount = config.game.defaultQuestionCount || 10;

    questionCountSelect.innerHTML = questionOptions
      .map((count) => {
        const isSelected = count === defaultQuestionCount;
        const displayText = count === "Все" ? "Все" : count;
        return `<option value="${count}" ${isSelected ? "selected" : ""}>${displayText}</option>`;
      })
      .join("");

    const timeLimitSelect = document.getElementById("time-limit");
    const timeOptions = config.game.timeLimitOptions || [5, 10, 15, 20, 30, 45, 60];
    const defaultTime = config.game.timeLimit || 15;

    timeLimitSelect.innerHTML = timeOptions
      .map((time) => {
        const isSelected = time === defaultTime;
        return `<option value="${time}" ${isSelected ? "selected" : ""}>${time}</option>`;
      })
      .join("");
  });

  // Fallback для конфигурации
  setTimeout(() => {
    const questionCountSelect = document.getElementById("question-count");
    const timeLimitSelect = document.getElementById("time-limit");

    if (questionCountSelect.innerHTML === "") {
      const defaultQuestionOptions = [
        "Все",
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
      ];
      const defaultQuestionCount = 10;

      questionCountSelect.innerHTML = defaultQuestionOptions
        .map((count) => {
          const isSelected = count === defaultQuestionCount;
          const displayText = count === "Все" ? "Все" : count;
          return `<option value="${count}" ${isSelected ? "selected" : ""}>${displayText}</option>`;
        })
        .join("");
    }

    if (timeLimitSelect.innerHTML === "") {
      const defaultTimeOptions = [5, 10, 15, 20, 30, 45, 60];
      const defaultTime = 15;

      timeLimitSelect.innerHTML = defaultTimeOptions
        .map((time) => {
          const isSelected = time === defaultTime;
          return `<option value="${time}" ${isSelected ? "selected" : ""}>${time}</option>`;
        })
        .join("");
    }
  }, 1000);

  // === Обработка разрыва соединения ===

  socket.on("disconnect", () => {
    showReconnectUI();
  });

  socket.on("reconnect", () => {
    hideReconnectUI();
    // Переподключение с тем же паролем не требуется, т.к. сессия уже установлена
  });

  socket.on("connect_error", () => {
    showReconnectUI();
  });

  // === Тёмная тема ===

  const themeToggle = document.getElementById("themeToggle");
  const html = document.documentElement;

  const savedTheme = localStorage.getItem("theme") || "light";
  html.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  themeToggle.addEventListener("click", () => {
    const currentTheme = html.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
  });

  function updateThemeIcon(theme) {
    themeToggle.innerHTML = theme === "dark" ? "☀️" : "🌙";
  }
})();
