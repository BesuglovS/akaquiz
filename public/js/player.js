/**
 * Клиентский скрипт для игрока
 */
(function () {
  const socket = io();
  const loginDiv = document.getElementById("login");
  const gameDiv = document.getElementById("game");
  const lobbyView = document.getElementById("lobby-view");
  const quizView = document.getElementById("quiz-view");
  const playerListDisplay = document.getElementById("player-list-display");
  const optionsList = document.getElementById("options-list");
  const timerBar = document.getElementById("timer-bar");
  let myNick = null;
  let mySelection = null;
  let myLastAnswerResult = null; // Результат последнего ответа от сервера

  /**
   * Перемешивает массив случайным образом
   */
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Показывает/скрывает индикатор загрузки
   */
  function showLoadingIndicator(show, text) {
    const indicator = document.getElementById("loadingIndicator");
    const loadingText = document.getElementById("loadingText");

    if (show) {
      indicator.style.display = "flex";
      loadingText.textContent = text;
    } else {
      indicator.style.display = "none";
    }
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

  // === Обработчики событий ===

  // Кнопка входа
  document.getElementById("join-btn").onclick = () => {
    const nick = document.getElementById("nick-input").value.trim();
    if (nick) {
      myNick = nick;
      showLoadingIndicator(true, "Подключение...");
      socket.emit("join", nick);
      loginDiv.classList.add("hidden");
      gameDiv.classList.remove("hidden");
    }
  };

  // Вход по Enter
  document.getElementById("nick-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const nick = event.target.value.trim();
      if (nick) {
        myNick = nick;
        showLoadingIndicator(true, "Подключение...");
        socket.emit("join", nick);
        loginDiv.classList.add("hidden");
        gameDiv.classList.remove("hidden");
      }
    }
  });

  // Ошибка входа
  socket.on("joinError", (message) => {
    showLoadingIndicator(false);
    alert("Ошибка: " + message);
    loginDiv.classList.remove("hidden");
    gameDiv.classList.add("hidden");
    myNick = null;
  });

  // Обновление списка игроков
  socket.on("playerListUpdate", (players) => {
    // Скрываем индикатор загрузки при успешном подключении
    showLoadingIndicator(false);

    const status = document.getElementById("lobby-status");
    if (status) status.innerText = `Уже в лобби: ${players.length}`;

    playerListDisplay.innerHTML = players
      .map((name) => {
        const isMe = name === myNick;
        return `<span class="chip ${isMe ? "chip--me" : ""}">${name}</span>`;
      })
      .join("");
  });

  // Результат ответа от сервера
  socket.on("answerResult", (data) => {
    myLastAnswerResult = data;
  });

  // Новый вопрос
  socket.on("updateQuestion", (data) => {
    lobbyView.classList.add("hidden");
    quizView.classList.remove("hidden");
    mySelection = null;
    myLastAnswerResult = null; // Сбрасываем результат при новом вопросе

    optionsList.innerHTML = "";

    document.getElementById("question-text").innerHTML = `
      ${data.question}
      ${data.questionImg ? `<img src="${data.questionImg}" class="question-inline-img">` : ""}
    `;

    const indexedOptions = data.options.map((opt, originalIndex) => ({
      ...opt,
      originalIndex,
    }));
    const shuffledOptions = shuffleArray(indexedOptions);

    optionsList.innerHTML = "";
    shuffledOptions.forEach((opt, displayIndex) => {
      const b = document.createElement("button");
      b.className = "btn option-btn" + (opt.img ? " with-img" : "");
      b.dataset.originalIndex = opt.originalIndex;
      b.innerHTML = `
        ${opt.img ? `<img src="${opt.img}" class="option-img">` : ""}
        <span class="option-label">${opt.text}</span>
      `;

      b.onclick = () => {
        if (mySelection === null) {
          mySelection = opt.originalIndex;
          socket.emit("submitAnswer", opt.originalIndex);
          b.classList.add("selected");
          Array.from(optionsList.children).forEach((btn) => (btn.disabled = true));
        }
      };
      optionsList.appendChild(b);
    });

    // Рестарт анимации таймера
    timerBar.style.transition = "none";
    timerBar.style.width = "100%";
    setTimeout(() => {
      timerBar.style.transition = `width ${data.timeLeft}s linear`;
      timerBar.style.width = "0%";
    }, 50);
    document.getElementById("q-num").textContent = data.questionNumber;
    document.getElementById("q-total").textContent = data.totalQuestions;
  });

  // Завершение времени
  socket.on("timeOver", (data) => {
    const { scores, correctAnswer, currentOptions } = data;
    const buttons = optionsList.querySelectorAll("button");

    buttons.forEach((btn) => {
      btn.disabled = true;
      const origIdx = parseInt(btn.dataset.originalIndex, 10);

      if (origIdx === correctAnswer) {
        btn.classList.add("correct");
        btn.innerHTML += " ✅";
      } else if (origIdx === mySelection && origIdx !== correctAnswer) {
        btn.classList.add("wrong");
        btn.innerHTML += " ❌";
      }
    });

    let correctText = "неизвестно";

    if (currentOptions && currentOptions[correctAnswer]) {
      correctText = currentOptions[correctAnswer].text;
    } else {
      const correctBtn = Array.from(buttons).find(
        (btn) => parseInt(btn.dataset.originalIndex, 10) === correctAnswer,
      );
      if (correctBtn) {
        correctText = correctBtn.textContent.replace(/[✅❌]/g, "").trim();
      }
    }

    setTimeout(() => {
      // Используем результат от сервера, если он есть
      const isCorrect = myLastAnswerResult
        ? myLastAnswerResult.isCorrect
        : mySelection === correctAnswer;
      const scoreEarned = myLastAnswerResult ? myLastAnswerResult.scoreEarned : 0;

      let html = `
        <div class="result-feedback ${isCorrect ? "text-success" : "text-danger"}">
          <div class="result-status-icon">${isCorrect ? "🔥" : "⏳"}</div>
          <h3>${isCorrect ? "Правильно!" : "Упс, не совсем..."}</h3>
          ${isCorrect ? `<p class="score-earned">+${scoreEarned} баллов</p>` : ""}
          <p class="correct-answer-reveal">Правильный ответ: <strong>${correctText}</strong></p>
        </div>
        
        <div class="mini-leaderboard">
          <h4>Текущий рейтинг:</h4>
          ${Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([name, score], i) => `
              <div class="rank-item ${name === myNick ? "is-me" : ""}">
                <span>${i + 1}. ${name}</span>
                <strong>${score}</strong>
              </div>
            `,
            )
            .join("")}
        </div>
      `;
      optionsList.innerHTML = html;
    }, 2000);
  });

  // Квиз завершен
  socket.on("quizFinished", (scores) => {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const myPlace = sorted.findIndex((item) => item[0] === myNick) + 1;

    quizView.innerHTML = `
      <div class="card result-card">
        <h2>Квиз завершен! 🏆</h2>
        <div class="my-result" style="margin-bottom: 20px; font-size: 1.2rem;">
          ${myPlace > 0 ? `Ваше место: <strong>#${myPlace}</strong>` : "Вы участвовали в игре"}
        </div>
        <div class="mini-leaderboard">
          ${sorted
            .map(([name, score], i) => {
              let pClass = "";
              if (i === 0) pClass = "place-1";
              else if (i === 1) pClass = "place-2";
              else if (i === 2) pClass = "place-3";

              return `
                <div class="rank-item ${pClass}">
                  <span>${i + 1}. ${name}</span>
                  <strong>${score}</strong>
                </div>
              `;
            })
            .join("")}
        </div>
        <p class="footer-msg" style="margin-top: 20px;">Ожидайте нового квиза!</p>
      </div>
    `;
  });

  // Сброс игры
  socket.on("gameReset", () => {
    location.reload();
  });

  // Пауза игры
  socket.on("gamePaused", () => {
    const pauseOverlay = document.createElement("div");
    pauseOverlay.id = "pause-overlay";
    pauseOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      font-family: 'Inter', sans-serif;
    `;
    pauseOverlay.innerHTML = `
      <h2>⏸️ Игра на паузе</h2>
      <p>Ожидайте продолжения...</p>
    `;
    document.body.appendChild(pauseOverlay);
  });

  socket.on("gameResumed", () => {
    const pauseOverlay = document.getElementById("pause-overlay");
    if (pauseOverlay) {
      pauseOverlay.remove();
    }
  });

  // Обработка разрыва соединения
  socket.on("disconnect", () => {
    showReconnectUI();
  });

  socket.on("reconnect", () => {
    hideReconnectUI();
    if (myNick) {
      socket.emit("join", myNick);
    }
  });

  socket.on("connect_error", () => {
    showReconnectUI();
  });

  // Тёмная тема
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
