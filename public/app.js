const state = {
  screen: "setup",
  playerCount: 2,
  players: [],
  mode: null,
  format: null,
  rounds: 10,
  doubleOut: false,
  gameState: null,
  activeGameState: null,
  boardView: "dartboard",
  themeIndex: 0,
  lastTurnId: null,
  lastGameId: null,
  chartPlayerIndex: 0
};

const playerCountButtons = document.getElementById("player-count-buttons");
const playerNames = document.getElementById("player-names");
const toModeBtn = document.getElementById("to-mode");
const formatOptions = document.getElementById("format-options");
const toggleRow = document.querySelector(".toggle-row");
const roundsValue = document.getElementById("rounds-value");
const roundsMinus = document.getElementById("rounds-minus");
const roundsPlus = document.getElementById("rounds-plus");
const doubleOutToggle = document.getElementById("double-out");
const startGameBtn = document.getElementById("start-game");
const undoBtn = document.getElementById("undo");
const endGameBtn = document.getElementById("end-game");
const dartboard = document.getElementById("dartboard");
const dartCtx = dartboard.getContext("2d");
const boardWrapper = document.querySelector(".board-wrapper");
const activePlayerName = document.getElementById("active-player-name");
const activePlayerScore = document.getElementById("active-player-score");
const topGameMode = document.getElementById("top-game-mode");
const gameRoundsPill = document.getElementById("game-rounds");
const dartCountPill = document.getElementById("dart-count");
const gameRoundsBottom = document.getElementById("game-rounds-bottom");
const dartCountBottom = document.getElementById("dart-count-bottom");
const scoreboard = document.getElementById("scoreboard");
const outComboList = document.getElementById("out-combo-list");
const outCombosPanel = document.querySelector(".out-combos");
const cricketBoard = document.getElementById("cricket-board");
const boardViewBtn = document.getElementById("board-view-btn");
const missBtn = document.getElementById("miss-btn");
const themeToggle = document.getElementById("theme-toggle");
const throwHistoryList = document.getElementById("throw-history-list");
const bustOverlay = document.getElementById("bust-overlay");
const backToGameBtn = document.getElementById("back-to-game");
const podium = document.getElementById("podium");
const playAgain = document.getElementById("play-again");
const historyList = document.getElementById("history-list");
const podiumChart = document.getElementById("podium-chart");
const podiumCricketBoard = document.getElementById("podium-cricket-board");
const chartPlayerButtons = document.getElementById("chart-player-buttons");
const chartYAxis = document.getElementById("chart-y-axis");
const chartLine = document.getElementById("chart-line");
const chartXAxis = document.getElementById("chart-x-axis");

let chartCycleTimer = null;
let podiumChartData = null;
let dartboardLogicalSize = 0;
let isBoardLocked = false;
let isUndoPending = false;
let isEndGamePending = false;

const SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
  3, 19, 7, 16, 8, 11, 14, 9, 12, 5
];
const RING_RATIOS = {
  doubleOuter: 0.9,
  doubleInner: 0.78,
  tripleOuter: 0.6,
  tripleInner: 0.5,
  outerBull: 0.16,
  innerBull: 0.08,
  outerSingleOuter: 0.9,
  outerSingleInner: 0.6,
  innerSingleOuter: 0.5,
  innerSingleInner: 0.16
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const themeOptions = [
  { name: "Classic", singleA: "#0b0b0b", singleB: "#e8ddc8", doubleA: "#0f7a3e", doubleB: "#c32121", tripleA: "#0f7a3e", tripleB: "#c32121", inner: "#0b0b0b", bullOuter: "#0f7a3e", bullInner: "#c32121" },
  { name: "Neon", singleA: "#1b255a", singleB: "#2f134e", doubleA: "#ffb84f", doubleB: "#4a1f2f", tripleA: "#7cff4f", tripleB: "#1d3a2a", inner: "#171733", bullOuter: "#4fd1ff", bullInner: "#ff4f7a" },
  { name: "Ocean", singleA: "#0f3b4f", singleB: "#0b2440", doubleA: "#4fd1ff", doubleB: "#153a6a", tripleA: "#7cffef", tripleB: "#113a3a", inner: "#0b1b2b", bullOuter: "#9c7cff", bullInner: "#ff4fd1" }
];

function loadTheme() {
  const stored = localStorage.getItem("boardTheme");
  const index = themeOptions.findIndex((option) => option.name === stored);
  state.themeIndex = index >= 0 ? index : 0;
  if (themeToggle) {
    themeToggle.textContent = `Theme: ${themeOptions[state.themeIndex].name}`;
  }
}

function playWhoosh(isBull) {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = isBull ? 520 : 260;
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(isBull ? 0.18 : 0.13125, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isBull ? 0.35 : 0.22));

  oscillator.connect(gainNode).connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(now + (isBull ? 0.38 : 0.25));
}

function playClick() {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 240;
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(0.075, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  oscillator.connect(gainNode).connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(now + 0.15);
}

function getBoardSize() {
  return dartboardLogicalSize || dartboard.clientWidth || dartboard.width;
}

function resizeDartboardCanvas() {
  if (!boardWrapper) return false;
  const rect = boardWrapper.getBoundingClientRect();
  const available = Math.min(rect.width, rect.height || rect.width);
  const nextSize = Math.max(240, Math.floor(available));
  if (!nextSize || nextSize === dartboardLogicalSize) return false;
  dartboardLogicalSize = nextSize;
  const dpr = window.devicePixelRatio || 1;
  dartboard.style.width = `${nextSize}px`;
  dartboard.style.height = `${nextSize}px`;
  dartboard.width = Math.round(nextSize * dpr);
  dartboard.height = Math.round(nextSize * dpr);
  dartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

function redrawDartboard() {
  const resized = resizeDartboardCanvas();
  if (dartboardLogicalSize || resized) {
    drawBoard(getHighlightMap(state.gameState));
  }
}

function setBoardLocked(locked) {
  isBoardLocked = locked;
  if (boardWrapper) {
    boardWrapper.classList.toggle("is-disabled", locked);
  }
  if (missBtn) {
    missBtn.disabled = locked;
  }
}

function playBust() {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = 160;
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(0.135, now + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  oscillator.connect(gainNode).connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(now + 0.42);
}

function playMiss() {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 190;
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(0.09, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  oscillator.connect(gainNode).connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(now + 0.3);
}

function ensureAudioRunning() {
  if (audioCtx.state === "running") return Promise.resolve();
  return audioCtx.resume();
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then((res) => res.json());
}

function setPending(button, pending) {
  if (!button) return;
  button.disabled = pending;
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });
  document.getElementById(`screen-${screenId}`).classList.add("active");
  if (screenId !== "end") {
    stopChartCycle();
  }
  if (screenId !== "game") {
    document.body.classList.remove("final-round");
  }
  if (screenId === "game" || screenId === "end") {
    topGameMode.classList.remove("hidden");
  } else {
    topGameMode.classList.add("hidden");
  }
  document.body.classList.toggle("game-active", screenId === "game");
  state.screen = screenId;
  updateBackToGame();
}

function setupPlayerCount() {
  playerCountButtons.innerHTML = "";
  for (let i = 1; i <= 8; i += 1) {
    const button = document.createElement("button");
    button.textContent = i;
    if (i === state.playerCount) button.classList.add("active");
    button.addEventListener("click", () => {
      state.playerCount = i;
      setupPlayerCount();
      renderPlayerInputs();
    });
    playerCountButtons.appendChild(button);
  }
}

function renderPlayerInputs() {
  playerNames.innerHTML = "";
  for (let i = 0; i < state.playerCount; i += 1) {
    const input = document.createElement("input");
    input.placeholder = `Player ${i + 1}`;
    playerNames.appendChild(input);
  }
}

function renderFormatOptions() {
  if (state.mode === "cricket") {
    formatOptions.classList.add("hidden");
    toggleRow.classList.add("hidden");
    state.format = "cricket";
    updateRounds(getDefaultRounds("cricket", "cricket"));
    return;
  }

  formatOptions.classList.remove("hidden");
  toggleRow.classList.remove("hidden");

  const formats = ["301", "501", "701"];
  if (state.mode === "countup") formats.push("inf");
  if (!formats.includes(state.format)) {
    state.format = formats[0];
  }
  formatOptions.innerHTML = "";
  formats.forEach((format) => {
    const btn = document.createElement("button");
    btn.textContent = format === "inf" ? "∞" : format;
    if (format === state.format) btn.classList.add("active");
    btn.addEventListener("click", () => {
      state.format = format;
      updateRounds(getDefaultRounds(state.mode, format));
      renderFormatOptions();
    });
    formatOptions.appendChild(btn);
  });
}

function updateRounds(value) {
  state.rounds = Math.max(1, Math.min(30, value));
  roundsValue.textContent = state.rounds;
}

function getDefaultRounds(mode, format) {
  if (mode === "cricket") return 20;
  if (format === "301") return 10;
  if (format === "501") return 12;
  if (format === "701") return 15;
  return 10;
}

function attachNav() {
  const navButtons = Array.from(
    document.querySelectorAll(".nav-button[data-nav]")
  );
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((nav) => {
        nav.classList.remove("active");
      });
      btn.classList.add("active");
      const target = btn.dataset.nav;
      if (target === "setup") {
        resetLocalState();
      }
      if (target === "history") {
        loadHistory();
      }
      showScreen(target);
    });
  });
}

function resetLocalState() {
  state.mode = null;
  state.format = null;
  state.rounds = 10;
  state.doubleOut = false;
  updateRounds(state.rounds);
  renderFormatOptions();
  doubleOutToggle.checked = false;
  showScreen("setup");
}

function renderGameState() {
  const gameState = state.gameState;
  if (!gameState || !gameState.game) return;
  const game = gameState.game;
  const players = gameState.players;
  const currentPlayer = players[game.currentPlayerIndex];
  if (state.lastGameId !== game.id) {
    state.lastGameId = game.id;
    state.lastTurnId = null;
    bustOverlay.classList.add("hidden");
  }
  const currentRound = currentPlayer.roundCount + 1;

  activePlayerName.textContent = currentPlayer.name;
  activePlayerName.style.color = currentPlayer.color;
  activePlayerScore.textContent = `${currentPlayer.score}`;
  const formatLabel = game.format === "inf" ? "∞" : game.format;
  const modeLabel =
    game.mode === "cricket"
      ? game.mode.toUpperCase()
      : `${game.mode.toUpperCase()} ${formatLabel}`;
  topGameMode.textContent = modeLabel;
  const roundText = `Round: ${currentRound} / ${game.rounds}`;
  const dartText = `Throw: ${game.dartIndex} / 3`;
  gameRoundsPill.textContent = roundText;
  dartCountPill.textContent = dartText;
  if (gameRoundsBottom && dartCountBottom) {
    gameRoundsBottom.textContent = roundText;
    dartCountBottom.textContent = dartText;
  }
  document.body.classList.toggle(
    "final-round",
    game.status === "in_progress" && currentRound >= game.rounds
  );

  if (game.status === "in_progress") {
    state.activeGameState = gameState;
  } else if (state.activeGameState?.game?.id === game.id) {
    state.activeGameState = null;
  }

  scoreboard.innerHTML = "";
  players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "score-row";
    if (player.id === currentPlayer.id) row.classList.add("active");
    const nameSpan = document.createElement("span");
    nameSpan.style.color = player.color;
    nameSpan.textContent = player.name;
    const scoreSpan = document.createElement("span");
    scoreSpan.textContent = `${player.score}`;
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);
    scoreboard.appendChild(row);
  });

  if (outCombosPanel) {
    outCombosPanel.classList.toggle("hidden", game.mode === "cricket");
  }
  outComboList.innerHTML = "";
  if (gameState.outCombos.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No finish available";
    outComboList.appendChild(li);
  } else {
    gameState.outCombos.forEach((combo) => {
      const li = document.createElement("li");
      li.textContent = combo;
      outComboList.appendChild(li);
    });
  }

  if (game.mode === "cricket") {
    boardViewBtn.parentElement.classList.remove("hidden");
  } else {
    boardViewBtn.parentElement.classList.add("hidden");
    toggleBoardView("dartboard");
  }

  renderCricketBoard(players);
  renderThrowHistory(gameState.turns || [], currentPlayer.id);
  redrawDartboard();
  showBustAnimation(gameState.turns || []);

  if (game.status === "completed") {
    document.body.classList.remove("final-round");
    renderPodium();
    showScreen("end");
  } else {
    showScreen("game");
  }
}

function updateBackToGame() {
  const hasActiveGame =
    state.activeGameState && state.activeGameState.game?.status === "in_progress";
  if (hasActiveGame && state.screen !== "game") {
    backToGameBtn.classList.remove("hidden");
  } else {
    backToGameBtn.classList.add("hidden");
  }
}

function renderCricketBoard(players) {
  if (state.boardView !== "cricket") return;
  cricketBoard.innerHTML = "";
  const segments = ["20", "19", "18", "17", "16", "15", "BULL"];
  cricketBoard.style.gridTemplateColumns = `minmax(84px, 140px) repeat(${players.length}, minmax(0, 1fr))`;
  const currentId = state.gameState?.players?.[state.gameState.game.currentPlayerIndex]?.id;

  const headerEmpty = document.createElement("div");
  headerEmpty.className = "cell header";
  headerEmpty.textContent = "";
  cricketBoard.appendChild(headerEmpty);

  players.forEach((player) => {
    const cell = document.createElement("div");
    const isCurrent = player.id === currentId;
    cell.className = `cell header${isCurrent ? " current-col" : ""}`;
    cell.style.color = player.color;
    cell.textContent = player.name;
    cricketBoard.appendChild(cell);
  });

  segments.forEach((segment) => {
    const rowClosed = players.every(
      (player) => (player.cricket[segment]?.marks || 0) >= 3
    );
    const segmentLabel = segment === "BULL" ? "BULL" : segment;
    const segmentCell = document.createElement("div");
    segmentCell.className = `cell header${rowClosed ? " closed" : ""}`;
    segmentCell.textContent = segmentLabel;
    cricketBoard.appendChild(segmentCell);

    players.forEach((player) => {
      const entry = player.cricket[segment] || { marks: 0 };
      const cell = document.createElement("div");
      const isCurrent = player.id === currentId;
      cell.className = `cell${rowClosed ? " closed" : ""}${isCurrent ? " current-col" : ""}`;
      cell.textContent = formatCricketMark(entry.marks);
      cricketBoard.appendChild(cell);
    });
  });
}

function formatCricketMark(count) {
  if (count <= 0) return "";
  if (count === 1) return "/";
  if (count === 2) return "X";
  return "O";
}

function renderThrowHistory(turns, playerId) {
  throwHistoryList.innerHTML = "";
  turns
    .filter((turn) => turn.player_id === playerId)
    .slice()
    .reverse()
    .forEach((turn) => {
      const item = document.createElement("div");
      const throwType = getThrowType(turn.segment);
      item.className = `throw-item ${throwType}`;
      item.textContent = `${turn.segment}`;
      throwHistoryList.appendChild(item);
    });
}

function getThrowType(segment) {
  if (segment === "MISS") return "throw-miss";
  if (segment === "SB") return "throw-bull";
  if (segment === "DB") return "throw-bull";
  if (segment.startsWith("T")) return "throw-triple";
  if (segment.startsWith("D")) return "throw-double";
  return "throw-single";
}

function showBustAnimation(turns) {
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || Number(lastTurn.is_bust) !== 1) {
    bustOverlay.classList.add("hidden");
    return;
  }
  if (state.lastTurnId === lastTurn.id) return;
  state.lastTurnId = lastTurn.id;
  audioCtx.resume();
  playBust();
  bustOverlay.classList.remove("hidden");
  setTimeout(() => {
    bustOverlay.classList.add("hidden");
  }, 800);
}

function renderPodium() {
  if (!state.gameState || !state.gameState.game) return;
  const game = state.gameState.game;
  const players = state.gameState.players || [];
  if (game.mode === "cricket") {
    podiumChart.classList.add("hidden");
  }
  const sortedPlayers = getSortedPlayersForMode(game, players);
  const podiumPlayers = sortedPlayers.slice(0, 3).map((player, index) => ({
    place: index + 1,
    name: player.name,
    score: player.score,
    color: player.color
  }));
  podium.innerHTML = "";
  const order = [2, 1, 3];
  const sorted = [...podiumPlayers].sort(
    (a, b) => order.indexOf(a.place) - order.indexOf(b.place)
  );
  sorted.forEach((winner) => {
    const card = document.createElement("div");
    const placeClass =
      winner.place === 1 ? "first" : winner.place === 2 ? "second" : "third";
    card.className = `podium-card ${placeClass}`;
    const top = document.createElement("div");
    top.className = "podium-top";
    const place = document.createElement("div");
    place.className = "place";
    place.textContent = `#${winner.place}`;
    const name = document.createElement("div");
    name.style.color = winner.color;
    name.style.fontSize = "22px";
    name.textContent = winner.name;
    const score = document.createElement("div");
    score.textContent = `${winner.score} pts`;
    top.appendChild(place);
    top.appendChild(name);
    top.appendChild(score);
    const base = document.createElement("div");
    base.className = "podium-base";
    card.appendChild(top);
    card.appendChild(base);
    podium.appendChild(card);
  });
  renderPodiumChart(game, sortedPlayers, state.gameState.turns || []);
}

function getSortedPlayersForMode(game, players) {
  const sorted = [...players];
  sorted.sort((a, b) => {
    if (game.mode === "countdown" || game.mode === "cricket") {
      return a.score - b.score;
    }
    return b.score - a.score;
  });
  return sorted;
}

function renderPodiumChart(game, sortedPlayers, turns) {
  if (!game) {
    podiumChart.classList.add("hidden");
    podiumCricketBoard.classList.add("hidden");
    podiumChartData = null;
    stopChartCycle();
    return;
  }
  if (game.mode === "cricket") {
    podiumChart.classList.add("hidden");
    podiumChartData = null;
    stopChartCycle();
    renderPodiumCricketBoard(sortedPlayers);
    return;
  }
  if (game.mode !== "countdown" && game.mode !== "countup") {
    podiumChart.classList.add("hidden");
    podiumCricketBoard.classList.add("hidden");
    podiumChartData = null;
    stopChartCycle();
    return;
  }
  podiumCricketBoard.classList.add("hidden");
  podiumChart.classList.remove("hidden");
  podiumChartData = buildChartData(game, sortedPlayers, turns);
  renderChartButtons(podiumChartData.players);
  state.chartPlayerIndex = 0;
  setActiveChartPlayer(state.chartPlayerIndex, true);
}

function renderPodiumCricketBoard(players) {
  podiumCricketBoard.classList.remove("hidden");
  podiumCricketBoard.innerHTML = "";
  const segments = ["20", "19", "18", "17", "16", "15", "BULL"];
  podiumCricketBoard.style.gridTemplateColumns = `140px repeat(${players.length}, 1fr)`;

  const headerEmpty = document.createElement("div");
  headerEmpty.className = "cell header";
  headerEmpty.textContent = "";
  podiumCricketBoard.appendChild(headerEmpty);

  players.forEach((player) => {
    const cell = document.createElement("div");
    cell.className = "cell header";
    cell.style.color = player.color;
    cell.textContent = player.name;
    podiumCricketBoard.appendChild(cell);
  });

  segments.forEach((segment) => {
    const rowClosed = players.every(
      (player) => (player.cricket[segment]?.marks || 0) >= 3
    );
    const segmentLabel = segment === "BULL" ? "BULL" : segment;
    const segmentCell = document.createElement("div");
    segmentCell.className = `cell header${rowClosed ? " closed" : ""}`;
    segmentCell.textContent = segmentLabel;
    podiumCricketBoard.appendChild(segmentCell);

    players.forEach((player) => {
      const entry = player.cricket[segment] || { marks: 0 };
      const cell = document.createElement("div");
      cell.className = `cell${rowClosed ? " closed" : ""}`;
      cell.textContent = formatCricketMark(entry.marks);
      podiumCricketBoard.appendChild(cell);
    });
  });
}

function buildChartData(game, players, turns) {
  const roundTotals = {};
  const roundIndex = {};
  players.forEach((player) => {
    roundTotals[player.id] = [];
    roundIndex[player.id] = -1;
  });
  turns.forEach((turn) => {
    const playerRounds = roundTotals[turn.player_id];
    if (!playerRounds) return;
    if (turn.dart_index === 1) {
      roundIndex[turn.player_id] += 1;
    }
    const currentRound = roundIndex[turn.player_id];
    if (currentRound < 0) return;
    const points = Math.abs(Number(turn.score_delta) || 0);
    playerRounds[currentRound] = (playerRounds[currentRound] || 0) + points;
  });
  const roundCounts = Object.values(roundTotals).map((entries) => entries.length);
  const maxRound = Math.max(game.rounds || 0, ...roundCounts, 1);
  const series = players.map((player) => {
    const rounds = roundTotals[player.id] || [];
    const padded = Array.from({ length: maxRound }, (_, idx) => rounds[idx] || 0);
    return { ...player, rounds: padded };
  });
  const maxPoints = Math.max(
    1,
    ...series.flatMap((player) => player.rounds)
  );
  return { rounds: maxRound, players: series, maxPoints };
}

function renderChartButtons(players) {
  chartPlayerButtons.innerHTML = "";
  players.forEach((player, index) => {
    const button = document.createElement("button");
    button.textContent = player.name;
    button.style.border = `1px solid ${player.color}`;
    button.addEventListener("click", () => {
      setActiveChartPlayer(index, true);
    });
    chartPlayerButtons.appendChild(button);
  });
}

function setActiveChartPlayer(index, restartCycle) {
  if (!podiumChartData || !podiumChartData.players.length) return;
  state.chartPlayerIndex = index % podiumChartData.players.length;
  Array.from(chartPlayerButtons.children).forEach((button, btnIndex) => {
    button.classList.toggle("active", btnIndex === state.chartPlayerIndex);
  });
  renderChartBars(podiumChartData.players[state.chartPlayerIndex]);
  if (restartCycle) startChartCycle();
}

function renderChartBars(player) {
  if (!podiumChartData) return;
  chartLine.innerHTML = "";
  chartXAxis.innerHTML = "";
  chartYAxis.innerHTML = "";
  const roundCount = podiumChartData.rounds;
  chartXAxis.style.gridTemplateColumns = `repeat(${roundCount}, minmax(0, 1fr))`;
  const maxPoints = podiumChartData.maxPoints || 1;
  const ticks = [maxPoints, Math.round(maxPoints * 0.66), Math.round(maxPoints * 0.33), 0];
  ticks.forEach((tick) => {
    const label = document.createElement("div");
    label.textContent = tick;
    chartYAxis.appendChild(label);
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = 1000;
  const height = 220;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart-line-svg");

  const paddingX = 14;
  const paddingY = 16;
  const usableWidth = Math.max(1, width - paddingX * 2);
  const usableHeight = Math.max(1, height - paddingY * 2);
  const points = player.rounds.map((value, index) => {
    const step = usableWidth / roundCount;
    const x =
      roundCount === 1
        ? paddingX + usableWidth / 2
        : paddingX + step * (index + 0.5);
    const y =
      paddingY + usableHeight - (value / maxPoints) * usableHeight;
    return { x, y, value, round: index + 1 };
  });

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", player.color);
  path.setAttribute("stroke-width", "4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", buildSmoothPath(points));
  svg.appendChild(path);

  points.forEach((point) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", point.x);
    dot.setAttribute("cy", point.y);
    dot.setAttribute("r", "4.5");
    dot.setAttribute("fill", player.color);
    dot.setAttribute("stroke", "#0b0a1b");
    dot.setAttribute("stroke-width", "2");
    dot.setAttribute("data-round", point.round);
    dot.setAttribute("data-value", point.value);
    svg.appendChild(dot);
  });

  chartLine.appendChild(svg);

  player.rounds.forEach((value, index) => {
    const roundLabel = document.createElement("div");
    roundLabel.textContent = index + 1;
    chartXAxis.appendChild(roundLabel);
  });
}

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const nextNext = points[i + 2] || next;
    const controlX1 = current.x + (next.x - current.x) * 0.4;
    const controlY1 = current.y + (next.y - current.y) * 0.4;
    const controlX2 = next.x - (nextNext.x - current.x) * 0.2;
    const controlY2 = next.y - (nextNext.y - current.y) * 0.2;
    path.push(
      `C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${next.x} ${next.y}`
    );
  }
  return path.join(" ");
}

function startChartCycle() {
  stopChartCycle();
  if (!podiumChartData || podiumChartData.players.length <= 1) return;
  chartCycleTimer = setInterval(() => {
    setActiveChartPlayer(state.chartPlayerIndex + 1, false);
  }, 5000);
}

function stopChartCycle() {
  if (chartCycleTimer) {
    clearInterval(chartCycleTimer);
    chartCycleTimer = null;
  }
}

function loadHistory() {
  fetch("/api/history")
    .then((res) => res.json())
    .then((data) => {
      historyList.innerHTML = "";
      data.history.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "history-card";
        card.addEventListener("click", () => {
          fetch(`/api/game/${entry.game_id}`)
            .then((res) => res.json())
            .then((gameState) => {
              state.gameState = gameState;
              renderGameState();
            });
        });
        const formatLabel =
          entry.format === "inf" ? "∞" : entry.mode === "cricket" ? "" : entry.format;
        const title = `${entry.mode.toUpperCase()}${formatLabel ? ` ${formatLabel}` : ""}`;
        const podium = entry.summary.podium
          .map((winner) => `#${winner.place} ${winner.name} (${winner.score})`)
          .join(" · ");
        const details = document.createElement("div");
        const line1 = document.createElement("div");
        line1.textContent = `${title} · Rounds ${entry.rounds}`;
        const line2 = document.createElement("div");
        line2.textContent = podium;
        const line3 = document.createElement("div");
        line3.style.opacity = "0.7";
        line3.textContent = new Date(entry.created_at).toLocaleString();
        details.appendChild(line1);
        details.appendChild(line2);
        details.appendChild(line3);

        const actions = document.createElement("div");
        actions.className = "history-actions";
        const deleteButton = document.createElement("button");
        deleteButton.className = "secondary-button delete-history";
        deleteButton.dataset.game = entry.game_id;
        deleteButton.textContent = "Delete";
        actions.appendChild(deleteButton);

        card.appendChild(details);
        card.appendChild(actions);
        historyList.appendChild(card);
      });
      historyList.querySelectorAll(".delete-history").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (btn.disabled) return;
          setPending(btn, true);
          fetch(`/api/history/${btn.dataset.game}`, { method: "DELETE" })
            .then(() => loadHistory())
            .catch(() => {
              setPending(btn, false);
            });
        });
      });
    });
}

function initDartboard() {
  resizeDartboardCanvas();
  drawBoard();
  if (typeof ResizeObserver !== "undefined" && boardWrapper) {
    const observer = new ResizeObserver(() => {
      redrawDartboard();
    });
    observer.observe(boardWrapper);
  }
  window.addEventListener("resize", () => {
    redrawDartboard();
  });
  dartboard.addEventListener("pointerdown", async (event) => {
    if (isBoardLocked) return;
    const rect = dartboard.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const segment = getSegmentForPoint(x, y);
    if (!segment || !state.gameState) return;
    setBoardLocked(true);
    try {
      await ensureAudioRunning();
      if (segment === "MISS") {
        playMiss();
      } else {
        const isBull = segment === "SB" || segment === "DB";
        playWhoosh(isBull);
      }
      const data = await postJson("/api/throw", {
        gameId: state.gameState.game.id,
        segment
      });
      state.gameState = data;
      renderGameState();
    } finally {
      setBoardLocked(false);
    }
  });
}

function getBoardRadius() {
  const center = getBoardSize() / 2;
  return center - 20;
}

function drawBoard(highlightMap = {}) {
  if (!dartboardLogicalSize) {
    resizeDartboardCanvas();
  }
  const size = getBoardSize();
  const center = size / 2;
  const radius = getBoardRadius();
  const theme = themeOptions[state.themeIndex];
  dartCtx.clearRect(0, 0, size, size);

  drawRing(
    radius * RING_RATIOS.outerSingleOuter,
    radius * RING_RATIOS.outerSingleInner,
    theme.singleA,
    theme.singleB
  );
  drawRing(
    radius * RING_RATIOS.innerSingleOuter,
    radius * RING_RATIOS.innerSingleInner,
    theme.singleA,
    theme.singleB
  );

  drawRing(
    radius * RING_RATIOS.doubleOuter,
    radius * RING_RATIOS.doubleInner,
    theme.doubleA,
    theme.doubleB
  );
  drawRing(
    radius * RING_RATIOS.tripleOuter,
    radius * RING_RATIOS.tripleInner,
    theme.tripleA,
    theme.tripleB
  );

  drawCircle(radius * RING_RATIOS.outerBull, theme.bullOuter);
  drawCircle(radius * RING_RATIOS.innerBull, theme.bullInner);

  drawHighlights(radius, highlightMap);

  drawNumbers(radius);
}

function drawRing(outerRadius, innerRadius, colorA, colorB) {
  const center = getBoardSize() / 2;
  for (let i = 0; i < 20; i += 1) {
    const startAngle = ((i * 18 - 90) * Math.PI) / 180;
    const endAngle = (((i + 1) * 18 - 90) * Math.PI) / 180;
    dartCtx.beginPath();
    dartCtx.arc(center, center, outerRadius, startAngle, endAngle);
    dartCtx.arc(center, center, innerRadius, endAngle, startAngle, true);
    dartCtx.closePath();
    dartCtx.fillStyle = i % 2 === 0 ? colorA : colorB;
    dartCtx.fill();
  }
}

function drawCircle(radius, color) {
  const center = getBoardSize() / 2;
  dartCtx.beginPath();
  dartCtx.arc(center, center, radius, 0, Math.PI * 2);
  dartCtx.fillStyle = color;
  dartCtx.fill();
}

function drawNumbers(radius) {
  const center = getBoardSize() / 2;
  dartCtx.fillStyle = "#ffffff";
  dartCtx.font = "bold 22px Arial";
  dartCtx.textAlign = "center";
  dartCtx.textBaseline = "middle";
  SEGMENT_ORDER.forEach((value, index) => {
    const angle = ((index * 18 - 90 + 9) * Math.PI) / 180;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    dartCtx.strokeStyle = "rgba(0,0,0,0.6)";
    dartCtx.lineWidth = 3;
    dartCtx.strokeText(value, x, y);
    dartCtx.fillText(value, x, y);
  });
}

function drawHighlights(radius, highlightMap) {
  Object.entries(highlightMap).forEach(([segmentValue, style]) => {
    if (segmentValue === "BULL") {
      const color = style === "penalty" ? "rgba(255, 79, 79, 0.5)" : "rgba(79, 209, 255, 0.4)";
      drawCircle(radius * 0.18, color);
      return;
    }
    const valueIndex = SEGMENT_ORDER.findIndex(
      (value) => value === Number(segmentValue)
    );
    if (valueIndex < 0) return;
    const startAngle = ((valueIndex * 18 - 90) * Math.PI) / 180;
    const endAngle = (((valueIndex + 1) * 18 - 90) * Math.PI) / 180;
    dartCtx.beginPath();
    const center = getBoardSize() / 2;
    dartCtx.arc(center, center, radius, startAngle, endAngle);
    dartCtx.arc(center, center, radius * 0.2, endAngle, startAngle, true);
    dartCtx.closePath();
    dartCtx.fillStyle =
      style === "penalty"
        ? "rgba(255, 79, 79, 0.3)"
        : "rgba(79, 209, 255, 0.45)";
    dartCtx.fill();
  });
}

function getSegmentForPoint(x, y) {
  const center = getBoardSize() / 2;
  const dx = x - center;
  const dy = y - center;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const boardRadius = getBoardRadius();
  const hitRadius = boardRadius * RING_RATIOS.doubleOuter;

  if (radius > hitRadius) return "MISS";

  const angleFromTop =
    (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  const index = Math.floor(angleFromTop / (Math.PI / 10)) % 20;
  const value = SEGMENT_ORDER[index];

  const doubleOuter = hitRadius;
  const doubleInner = boardRadius * RING_RATIOS.doubleInner;
  const tripleOuter = boardRadius * RING_RATIOS.tripleOuter;
  const tripleInner = boardRadius * RING_RATIOS.tripleInner;
  const outerBull = boardRadius * RING_RATIOS.outerBull;
  const innerBull = boardRadius * RING_RATIOS.innerBull;

  if (radius <= innerBull) return "DB";
  if (radius <= outerBull) return "SB";
  if (radius >= doubleInner && radius <= doubleOuter) return `D${value}`;
  if (radius >= tripleInner && radius <= tripleOuter) return `T${value}`;
  return `S${value}`;
}

function toggleBoardView(view) {
  state.boardView = view;
  boardViewBtn.textContent = view === "dartboard" ? "Match" : "Dartboard";
  if (view === "dartboard") {
    dartboard.classList.remove("hidden");
    boardWrapper.classList.remove("hidden");
    cricketBoard.classList.add("hidden");
    document.body.classList.remove("cricket-view");
    redrawDartboard();
  } else {
    dartboard.classList.add("hidden");
    boardWrapper.classList.add("hidden");
    cricketBoard.classList.remove("hidden");
    renderCricketBoard(state.gameState?.players || []);
    document.body.classList.add("cricket-view");
  }
}

function getHighlightMap(gameState) {
  if (!gameState || gameState.game.mode !== "cricket") return {};
  const currentPlayer = gameState.players[gameState.game.currentPlayerIndex];
  const highlights = {};
  ["20", "19", "18", "17", "16", "15", "BULL"].forEach((segment) => {
    const currentMarks = currentPlayer.cricket[segment]?.marks || 0;
    const allPlayersClosed = gameState.players.every(
      (player) => (player.cricket[segment]?.marks || 0) >= 3
    );
    if (allPlayersClosed) return;
    if (currentMarks < 3) {
      highlights[segment === "BULL" ? "BULL" : segment] = "target";
      return;
    }
    const opponentsOpen = gameState.players.some((player) => {
      if (player.id === currentPlayer.id) return false;
      return (player.cricket[segment]?.marks || 0) < 3;
    });
    if (opponentsOpen) {
      highlights[segment === "BULL" ? "BULL" : segment] = "penalty";
    }
  });
  return highlights;
}

function init() {
  setupPlayerCount();
  renderPlayerInputs();
  updateRounds(state.rounds);
  loadTheme();
  attachNav();
  initDartboard();
  toggleBoardView("dartboard");
  updateBackToGame();

  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      const button = target.closest("button");
      if (!button) return;
      if (button.id === "miss-btn") return;
      ensureAudioRunning().then(() => {
        playClick();
      });
    },
    { capture: true }
  );

  toModeBtn.addEventListener("click", () => {
    const inputs = Array.from(playerNames.querySelectorAll("input"));
    state.players = inputs.map((input) => input.value || input.placeholder);
    showScreen("mode");
  });

  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.mode = card.dataset.mode;
      renderFormatOptions();
      updateRounds(getDefaultRounds(state.mode, state.format));
      showScreen("format");
    });
  });

  roundsMinus.addEventListener("click", () => updateRounds(state.rounds - 1));
  roundsPlus.addEventListener("click", () => updateRounds(state.rounds + 1));

  doubleOutToggle.addEventListener("change", (event) => {
    state.doubleOut = event.target.checked;
  });

  startGameBtn.addEventListener("click", () => {
    postJson("/api/game", {
      players: state.players,
      mode: state.mode,
      format: state.format,
      rounds: state.rounds,
      doubleOut: state.doubleOut
    }).then((data) => {
      state.gameState = data;
      renderGameState();
    });
  });

  undoBtn.addEventListener("click", async () => {
    if (!state.gameState?.game?.id || isUndoPending) return;
    isUndoPending = true;
    setPending(undoBtn, true);
    setBoardLocked(true);
    try {
      const data = await postJson("/api/undo", {
        gameId: state.gameState.game.id
      });
      state.gameState = data;
      renderGameState();
    } finally {
      isUndoPending = false;
      setPending(undoBtn, false);
      setBoardLocked(false);
    }
  });

  endGameBtn.addEventListener("click", async () => {
    if (!state.gameState?.game?.id || isEndGamePending) return;
    isEndGamePending = true;
    setPending(endGameBtn, true);
    try {
      const data = await postJson("/api/end", {
        gameId: state.gameState.game.id
      });
      state.gameState = data;
      renderGameState();
    } finally {
      isEndGamePending = false;
      setPending(endGameBtn, false);
    }
  });

  boardViewBtn.addEventListener("click", () => {
    const nextView = state.boardView === "dartboard" ? "cricket" : "dartboard";
    toggleBoardView(nextView);
  });

  missBtn.addEventListener("click", async () => {
    if (isBoardLocked) return;
    if (!state.gameState?.game?.id) return;
    setBoardLocked(true);
    try {
      await ensureAudioRunning();
      playMiss();
      const data = await postJson("/api/throw", {
        gameId: state.gameState.game.id,
        segment: "MISS"
      });
      state.gameState = data;
      renderGameState();
    } finally {
      setBoardLocked(false);
    }
  });

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      state.themeIndex = (state.themeIndex + 1) % themeOptions.length;
      const themeName = themeOptions[state.themeIndex].name;
      themeToggle.textContent = `Theme: ${themeName}`;
      localStorage.setItem("boardTheme", themeName);
      drawBoard(getHighlightMap(state.gameState));
    });
  }

  playAgain.addEventListener("click", () => {
    resetLocalState();
  });

  backToGameBtn.addEventListener("click", () => {
    if (!state.activeGameState?.game) return;
    const gameId = state.activeGameState.game.id;
    fetch(`/api/game/${gameId}`)
      .then((res) => res.json())
      .then((gameState) => {
        state.gameState = gameState;
        state.activeGameState = gameState.game?.status === "in_progress" ? gameState : null;
        renderGameState();
      })
      .catch(() => {
        state.gameState = state.activeGameState;
        renderGameState();
      });
  });

  fetch("/api/state")
    .then((res) => res.json())
    .then((data) => {
      if (data.game) {
        state.gameState = data;
        state.activeGameState = data;
        renderGameState();
      } else {
        state.activeGameState = null;
        showScreen("setup");
      }
      updateBackToGame();
    });
}

init();
