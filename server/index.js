const express = require("express");
const path = require("path");
const { initDb } = require("./db");
const {
  createGame,
  getLatestInProgressGameId,
  getGameState,
  applyThrow,
  undoThrow,
  listHistory,
  endGame,
  deleteGame
} = require("./gameService");

const app = express();
const PORT = process.env.PORT || 8003;

initDb();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/state", async (req, res) => {
  const latestId = await getLatestInProgressGameId();
  if (!latestId) return res.json({ game: null });
  return res.json(await getGameState(latestId));
});

app.get("/api/game/:gameId", async (req, res) => {
  const { gameId } = req.params;
  if (!gameId) return res.status(400).json({ error: "gameId required" });
  return res.json(await getGameState(gameId));
});

app.post("/api/game", async (req, res) => {
  const { players, mode, format, rounds, doubleOut } = req.body;
  if (!players || players.length === 0) {
    return res.status(400).json({ error: "Játékosok megadása szükséges" });
  }
  const gameId = await createGame({
    players,
    mode,
    format,
    rounds: Number(rounds) || 10,
    doubleOut: Boolean(doubleOut)
  });
  return res.json(await getGameState(gameId));
});

app.post("/api/throw", async (req, res) => {
  const { gameId, segment } = req.body;
  if (!gameId || !segment) {
    return res.status(400).json({ error: "gameId and segment required" });
  }
  return res.json(await applyThrow(gameId, segment));
});

app.post("/api/undo", async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: "gameId required" });
  return res.json(await undoThrow(gameId));
});

app.post("/api/end", async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: "gameId required" });
  return res.json(await endGame(gameId));
});

app.get("/api/history", async (req, res) => {
  return res.json({ history: await listHistory() });
});

app.delete("/api/history/:gameId", async (req, res) => {
  const { gameId } = req.params;
  if (!gameId) return res.status(400).json({ error: "gameId required" });
  await deleteGame(gameId);
  return res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dartmania running on port ${PORT}`);
});
