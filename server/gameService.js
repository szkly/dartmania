const { randomUUID } = require("crypto");
const { getDb } = require("./db");

const COLOR_PALETTE = [
  "#ff4f7a",
  "#4fd1ff",
  "#7cff4f",
  "#ffd84f",
  "#9c7cff",
  "#ff944f",
  "#4fff9c",
  "#ff4fd1"
];

const CRICKET_SEGMENTS = ["20", "19", "18", "17", "16", "15", "BULL"];

function now() {
  return new Date().toISOString();
}

function parseFormat(format) {
  if (format === "inf") return null;
  const parsed = Number.parseInt(format, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function segmentInfo(segment) {
  if (segment === "MISS") {
    return { baseValue: 0, multiplier: 0, isDouble: false };
  }
  if (segment === "SB") {
    return { baseValue: 25, multiplier: 1, isDouble: false };
  }
  if (segment === "DB") {
    return { baseValue: 25, multiplier: 2, isDouble: true };
  }
  const multiplier = segment.startsWith("T")
    ? 3
    : segment.startsWith("D")
    ? 2
    : 1;
  const value = Number.parseInt(segment.slice(1), 10);
  return { baseValue: value, multiplier, isDouble: multiplier === 2 };
}

let transactionQueue = Promise.resolve();

async function withTransaction(fn) {
  const run = async () => {
    const db = await getDb();
    await db.exec("BEGIN");
    try {
      const result = await fn(db);
      await db.exec("COMMIT");
      return result;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  };

  transactionQueue = transactionQueue.then(run, run);
  return transactionQueue;
}

async function createGame({ players, mode, format, rounds, doubleOut }) {
  const gameId = randomUUID();
  const createdAt = now();
  const target = parseFormat(format);
  const initialScore =
    mode === "countdown" ? target || 301 : mode === "countup" ? 0 : 0;

  const shuffled = [...players].sort(() => Math.random() - 0.5);

  await withTransaction(async (db) => {
    await db.run(
      `INSERT INTO games
       (id, status, mode, format, rounds, double_out, current_player_index, dart_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        "in_progress",
        mode,
        format,
        rounds,
        doubleOut ? 1 : 0,
        0,
        1,
        createdAt,
        createdAt
      ]
    );

    for (const [index, name] of shuffled.entries()) {
      const playerId = randomUUID();
      const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
      await db.run("INSERT INTO players (id, name, color) VALUES (?, ?, ?)", [
        playerId,
        name.trim() || `Játékos ${index + 1}`,
        color
      ]);
      await db.run(
        `INSERT INTO game_players
         (id, game_id, player_id, order_index, score, round_count, turn_start_score, darts_thrown)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          gameId,
          playerId,
          index,
          initialScore,
          0,
          initialScore,
          0
        ]
      );

      if (mode === "cricket") {
        for (const segment of CRICKET_SEGMENTS) {
          await db.run(
            `INSERT INTO cricket_marks
             (id, game_id, player_id, segment, marks, points)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [randomUUID(), gameId, playerId, segment, 0, 0]
          );
        }
      }
    }
  });

  return gameId;
}

async function getLatestInProgressGameId() {
  const db = await getDb();
  const row = await db.get(
    `SELECT id FROM games
     WHERE status = 'in_progress'
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  return row ? row.id : null;
}

async function getGameMeta(gameId, dbOverride) {
  const db = dbOverride || (await getDb());
  return db.get("SELECT * FROM games WHERE id = ?", [gameId]);
}

async function getPlayers(gameId, dbOverride) {
  const db = dbOverride || (await getDb());
  return db.all(
    `SELECT gp.*, p.name, p.color
     FROM game_players gp
     JOIN players p ON p.id = gp.player_id
     WHERE gp.game_id = ?
     ORDER BY gp.order_index ASC`,
    [gameId]
  );
}

async function getCricketMarks(gameId, dbOverride) {
  const db = dbOverride || (await getDb());
  const rows = await db.all(`SELECT * FROM cricket_marks WHERE game_id = ?`, [
    gameId
  ]);
  const marks = {};
  rows.forEach((row) => {
    if (!marks[row.player_id]) marks[row.player_id] = {};
    marks[row.player_id][row.segment] = {
      marks: row.marks,
      points: row.points
    };
  });
  return marks;
}

async function listHistory() {
  const db = await getDb();
  const rows = await db.all(
    `SELECT h.id as history_id, h.game_id, h.summary_json, h.created_at, g.mode, g.format, g.rounds
     FROM history h
     JOIN games g ON g.id = h.game_id
     ORDER BY h.created_at DESC`
  );
  return rows.map((row) => ({
    ...row,
    summary: JSON.parse(row.summary_json)
  }));
}

function buildOutCombos({ mode, format, doubleOut, playerScore }) {
  const target = parseFormat(format);
  if (mode === "cricket") return [];
  if (mode === "countup" && target === null) return [];
  const remaining = mode === "countdown" ? playerScore : target - playerScore;
  if (remaining <= 0 || remaining > 180) return [];

  const segments = [];
  for (let i = 1; i <= 20; i += 1) {
    segments.push({ label: `S${i}`, value: i, isDouble: false });
    segments.push({ label: `D${i}`, value: i * 2, isDouble: true });
    segments.push({ label: `T${i}`, value: i * 3, isDouble: false });
  }
  segments.push({ label: "SB", value: 25, isDouble: false });
  segments.push({ label: "DB", value: 50, isDouble: true });

  const combos = [];
  const maxCombos = 12;

  function tryAdd(combo, total) {
    if (total !== remaining) return;
    if (doubleOut && !combo[combo.length - 1].isDouble) return;
    const label = combo.map((c) => c.label).join(" ");
    combos.push(label);
  }

  segments.forEach((a) => {
    tryAdd([a], a.value);
    segments.forEach((b) => {
      tryAdd([a, b], a.value + b.value);
      segments.forEach((c) => {
        if (combos.length >= maxCombos) return;
        tryAdd([a, b, c], a.value + b.value + c.value);
      });
    });
  });

  const unique = [...new Set(combos)];
  unique.sort((left, right) => left.split(" ").length - right.split(" ").length);
  return unique.slice(0, maxCombos);
}

function getPodium(game, players) {
  const sorted = [...players].sort((a, b) => {
    if (game.mode === "countdown" || game.mode === "cricket") {
      return a.score - b.score;
    }
    return b.score - a.score;
  });
  return sorted.slice(0, 3).map((player, index) => ({
    place: index + 1,
    name: player.name,
    score: player.score,
    color: player.color
  }));
}

function hasClosedAllSegments(marks) {
  return CRICKET_SEGMENTS.every((segment) => (marks[segment]?.marks || 0) >= 3);
}

function hasCricketWinner(players, marks) {
  const closedPlayers = players.filter((player) =>
    hasClosedAllSegments(marks[player.player_id] || {})
  );
  if (closedPlayers.length === 0) return false;
  const lowestScore = Math.min(...players.map((player) => player.score));
  return closedPlayers.some((player) => player.score <= lowestScore);
}

async function finalizeGame(game, players, dbOverride) {
  const podium = getPodium(game, players);
  const summary = {
    podium,
    mode: game.mode,
    format: game.format,
    rounds: game.rounds,
    finishedAt: now()
  };
  const db = dbOverride || (await getDb());
  await db.run(
    `UPDATE games
     SET status = 'completed', updated_at = ?, finished_at = ?, winner_snapshot = ?
     WHERE id = ?`,
    [summary.finishedAt, summary.finishedAt, JSON.stringify(summary), game.id]
  );
  await db.run(`DELETE FROM history WHERE game_id = ?`, [game.id]);
  await db.run(
    `INSERT INTO history (id, game_id, summary_json, created_at)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), game.id, JSON.stringify(summary), summary.finishedAt]
  );
  return summary;
}

async function checkRoundsComplete(gameId, rounds, dbOverride) {
  const db = dbOverride || (await getDb());
  const row = await db.get(
    `SELECT COUNT(*) as doneCount
     FROM game_players
     WHERE game_id = ? AND round_count >= ?`,
    [gameId, rounds]
  );
  const total = await db.get(
    `SELECT COUNT(*) as totalCount FROM game_players WHERE game_id = ?`,
    [gameId]
  );
  return row.doneCount === total.totalCount;
}

async function applySegmentInternal(gameId, segment, recordTurn, dbOverride) {
  const game = await getGameMeta(gameId, dbOverride);
  if (!game || game.status !== "in_progress") {
    return null;
  }

  const players = await getPlayers(gameId, dbOverride);
  const currentPlayer = players[game.current_player_index];
  const info = segmentInfo(segment);
  const target = parseFormat(game.format);
  const doubleOut = game.double_out === 1;
  const createdAt = now();

  let { score, darts_thrown: dartsThrown, turn_start_score: turnStartScore } =
    currentPlayer;
  const dartNumber = dartsThrown + 1;
  let scoreDelta = 0;
  let bust = false;
  let finished = false;
  let endTurn = false;

  if (dartsThrown === 0) {
    turnStartScore = score;
  }

  if (game.mode === "countdown") {
    const newScore = score - info.baseValue * info.multiplier;
    if (newScore < 0 || (doubleOut && newScore === 1)) {
      bust = true;
    } else if (newScore === 0 && doubleOut && !info.isDouble) {
      bust = true;
    } else if (newScore === 0) {
      score = newScore;
      scoreDelta = -info.baseValue * info.multiplier;
      finished = true;
    } else {
      scoreDelta = -info.baseValue * info.multiplier;
      score = newScore;
    }
  } else if (game.mode === "countup") {
    const dartScore = info.baseValue * info.multiplier;
    const newScore = score + dartScore;
    if (target !== null) {
      if (newScore > target) {
        bust = true;
      } else if (newScore === target && doubleOut && !info.isDouble) {
        bust = true;
      } else if (newScore === target) {
        score = newScore;
        scoreDelta = dartScore;
        finished = true;
      } else {
        score = newScore;
        scoreDelta = dartScore;
      }
    } else {
      score = newScore;
      scoreDelta = dartScore;
    }
  }
  let cricketMarkUpdate = null;
  const opponentScoreUpdates = [];

  if (game.mode === "cricket") {
    const cricket = await getCricketMarks(gameId, dbOverride);
    const segmentKey =
      segment === "SB" || segment === "DB"
        ? "BULL"
        : segment.slice(1);

    if (CRICKET_SEGMENTS.includes(segmentKey)) {
      const marksEntry = cricket[currentPlayer.player_id][segmentKey];
      const addMarks =
        segment === "DB" ? 2 : segment === "SB" ? 1 : info.multiplier;
      let remainingMarks = addMarks;
      let pointsGiven = 0;
      while (remainingMarks > 0) {
        if (marksEntry.marks < 3) {
          marksEntry.marks += 1;
        } else {
          const pointsValue = segmentKey === "BULL" ? 25 : Number(segmentKey);
          players.forEach((player) => {
            if (player.player_id === currentPlayer.player_id) return;
            const opponentMarks = cricket[player.player_id][segmentKey].marks;
            if (opponentMarks < 3) {
              opponentScoreUpdates.push({
                playerId: player.id,
                newScore: player.score + pointsValue
              });
              player.score += pointsValue;
              pointsGiven += pointsValue;
            }
          });
        }
        remainingMarks -= 1;
      }
      cricketMarkUpdate = {
        marks: marksEntry.marks,
        points: marksEntry.points + pointsGiven,
        segmentKey
      };
    }
  }

  if (bust) {
    score = turnStartScore;
    scoreDelta = 0;
    dartsThrown = 3;
  } else {
    dartsThrown += 1;
  }

  if (finished || dartsThrown >= 3) {
    endTurn = true;
  }

  const performWrites = async (db) => {
    if (recordTurn) {
      await db.run(
        `INSERT INTO turns
         (id, game_id, player_id, order_index, dart_index, segment, base_value, multiplier, score_delta, created_at, is_bust)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          gameId,
          currentPlayer.player_id,
          currentPlayer.order_index,
          dartNumber,
          segment,
          info.baseValue,
          info.multiplier,
          scoreDelta,
          createdAt,
          bust ? 1 : 0
        ]
      );
    }

    await db.run(
      `UPDATE game_players
       SET score = ?, turn_start_score = ?, darts_thrown = ?
       WHERE id = ?`,
      [score, turnStartScore, dartsThrown, currentPlayer.id]
    );

    for (const update of opponentScoreUpdates) {
      await db.run(
        `UPDATE game_players
         SET score = ?
         WHERE id = ?`,
        [update.newScore, update.playerId]
      );
    }

    if (cricketMarkUpdate) {
      await db.run(
        `UPDATE cricket_marks
         SET marks = ?, points = ?
         WHERE game_id = ? AND player_id = ? AND segment = ?`,
        [
          cricketMarkUpdate.marks,
          cricketMarkUpdate.points,
          gameId,
          currentPlayer.player_id,
          cricketMarkUpdate.segmentKey
        ]
      );
    }

    if (endTurn) {
      await db.run(
        `UPDATE game_players
         SET round_count = round_count + 1, darts_thrown = 0
         WHERE id = ?`,
        [currentPlayer.id]
      );
      const nextIndex = (game.current_player_index + 1) % players.length;
      await db.run(
        `UPDATE games
         SET current_player_index = ?, dart_index = 1, updated_at = ?
         WHERE id = ?`,
        [nextIndex, createdAt, gameId]
      );
    } else {
      await db.run(
        `UPDATE games
         SET dart_index = ?, updated_at = ?
         WHERE id = ?`,
        [dartsThrown + 1, createdAt, gameId]
      );
    }
  };

  if (dbOverride) {
    await performWrites(dbOverride);
  } else {
    await withTransaction(async (db) => {
      await performWrites(db);
    });
  }

  let updatedGame = await getGameMeta(gameId, dbOverride);
  const updatedPlayers = await getPlayers(gameId, dbOverride);

  if (finished) {
    await finalizeGame(updatedGame, updatedPlayers, dbOverride);
  } else if (updatedGame.mode === "cricket") {
    const updatedMarks = await getCricketMarks(gameId, dbOverride);
    if (hasCricketWinner(updatedPlayers, updatedMarks)) {
      await finalizeGame(updatedGame, updatedPlayers, dbOverride);
    }
  } else if (
    updatedGame.rounds > 0 &&
    (await checkRoundsComplete(gameId, updatedGame.rounds, dbOverride))
  ) {
    await finalizeGame(updatedGame, updatedPlayers, dbOverride);
  }

  return true;
}

async function applyThrow(gameId, segment) {
  const applied = await applySegmentInternal(gameId, segment, true);
  if (!applied) return getGameState(gameId);
  return getGameState(gameId);
}

async function resetGameState(gameId, dbOverride) {
  const game = await getGameMeta(gameId, dbOverride);
  const players = await getPlayers(gameId, dbOverride);
  const target = parseFormat(game.format);
  const initialScore =
    game.mode === "countdown" ? target || 301 : game.mode === "countup" ? 0 : 0;

  const performReset = async (db) => {
    await db.run(`DELETE FROM history WHERE game_id = ?`, [gameId]);
    for (const player of players) {
      await db.run(
        `UPDATE game_players
         SET score = ?, round_count = 0, turn_start_score = ?, darts_thrown = 0
         WHERE id = ?`,
        [initialScore, initialScore, player.id]
      );
    }
    if (game.mode === "cricket") {
      await db.run(
        `UPDATE cricket_marks
         SET marks = 0, points = 0
         WHERE game_id = ?`,
        [gameId]
      );
    }
    await db.run(
      `UPDATE games
       SET current_player_index = 0, dart_index = 1, updated_at = ?, status = 'in_progress', finished_at = NULL, winner_snapshot = NULL
       WHERE id = ?`,
      [now(), gameId]
    );
  };

  if (dbOverride) {
    await performReset(dbOverride);
  } else {
    await withTransaction(async (db) => {
      await performReset(db);
    });
  }
}

async function replayTurns(gameId) {
  await withTransaction(async (db) => {
    await resetGameState(gameId, db);
    const turns = await db.all(
      `SELECT * FROM turns
       WHERE game_id = ?
       ORDER BY created_at ASC`,
      [gameId]
    );
    for (const turn of turns) {
      await applySegmentInternal(gameId, turn.segment, false, db);
    }
  });
}

async function undoThrow(gameId) {
  const db = await getDb();
  const lastTurn = await db.get(
    `SELECT * FROM turns
     WHERE game_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [gameId]
  );
  if (!lastTurn) return getGameState(gameId);
  await db.run("DELETE FROM turns WHERE id = ?", [lastTurn.id]);
  await replayTurns(gameId);
  return getGameState(gameId);
}

async function getTurns(gameId) {
  const db = await getDb();
  return db.all(
    `SELECT id, player_id, segment, dart_index, score_delta, created_at, is_bust
     FROM turns
     WHERE game_id = ?
     ORDER BY created_at ASC`,
    [gameId]
  );
}

async function getGameState(gameId) {
  let game = await getGameMeta(gameId);
  if (!game) return { game: null };
  let players = await getPlayers(gameId);

  if (game.status === "in_progress" && game.rounds > 0) {
    const roundsComplete = await checkRoundsComplete(gameId, game.rounds);
    if (roundsComplete) {
      await finalizeGame(game, players);
      game = await getGameMeta(gameId);
      players = await getPlayers(gameId);
    }
  }

  const cricket = game.mode === "cricket" ? await getCricketMarks(gameId) : {};
  const turns = await getTurns(gameId);
  const currentPlayer = players[game.current_player_index];
  const outCombos = currentPlayer
    ? buildOutCombos({
        mode: game.mode,
        format: game.format,
        doubleOut: game.double_out === 1,
        playerScore: currentPlayer.score
      })
    : [];
  return {
    game: {
      id: game.id,
      status: game.status,
      mode: game.mode,
      format: game.format,
      rounds: game.rounds,
      doubleOut: game.double_out === 1,
      currentPlayerIndex: game.current_player_index,
      dartIndex: game.dart_index
    },
    players: players.map((player) => ({
      id: player.player_id,
      name: player.name,
      color: player.color,
      orderIndex: player.order_index,
      score: player.score,
      roundCount: player.round_count,
      dartsThrown: player.darts_thrown,
      cricket: cricket[player.player_id] || {}
    })),
    turns,
    outCombos
  };
}

async function endGame(gameId) {
  const game = await getGameMeta(gameId);
  if (!game) return { game: null };
  const players = await getPlayers(gameId);
  await finalizeGame(game, players);
  return getGameState(gameId);
}

async function deleteGame(gameId) {
  const db = await getDb();
  await withTransaction(async (tx) => {
    const playerRows = await tx.all(
      `SELECT player_id FROM game_players WHERE game_id = ?`,
      [gameId]
    );
    const playerIds = playerRows.map((row) => row.player_id);
    await tx.run(`DELETE FROM turns WHERE game_id = ?`, [gameId]);
    await tx.run(`DELETE FROM cricket_marks WHERE game_id = ?`, [gameId]);
    await tx.run(`DELETE FROM history WHERE game_id = ?`, [gameId]);
    await tx.run(`DELETE FROM game_players WHERE game_id = ?`, [gameId]);
    if (playerIds.length > 0) {
      const placeholders = playerIds.map(() => "?").join(", ");
      await tx.run(
        `DELETE FROM players WHERE id IN (${placeholders})`,
        playerIds
      );
    }
    await tx.run(`DELETE FROM games WHERE id = ?`, [gameId]);
  });
  return true;
}

module.exports = {
  createGame,
  getLatestInProgressGameId,
  getGameState,
  applyThrow,
  undoThrow,
  listHistory,
  endGame,
  deleteGame
};
