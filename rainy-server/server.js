import { getShuffledWords } from "./wordList.js";
import { getShuffledClashWords } from "./wordList.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*"; // set to your React URL in prod
const DEFAULT_GAME_DURATION_MIN = 3;           // fallback ถ้า client ไม่ส่งมา
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 5;
const WORD_SPAWN_MS = 3000; // new word every 3s (tweak as you like)
var gameMode;

function rand5to10() {
  return Math.floor(Math.random() * 6) + 5; // 5..10
}

const WORDS = [
  "apple","table","music","chair","light","train","story","dream","stone","paper",
  "cat","dog","fish","bird","horse","tiger","lion","zebra","mouse","snake",
  "green","blue","red","black","white","yellow","purple","orange","brown","pink",
  "river","mountain","beach","island","forest","desert","ocean","bridge","road","tower",
  "book","pencil","phone","clock","watch","radio","camera","mirror","glass","bottle",
  "happy","sad","angry","tired","proud","brave","calm","shy","kind","lucky",
  "run","jump","swim","fly","dance","sing","read","write","draw","paint",
  "fast","slow","hot","cold","big","small","long","short","high","low",
  "car","bus","truck","plane","ship","bike","train","metro","rocket","subway",
  "king","queen","prince","princess","wizard","witch","knight","dragon","castle","crown",
  "gold","silver","iron","steel","copper","diamond","ruby","sapphire","emerald","pearl",
  "city","village","market","school","temple","church","palace","garden","bridge","park",
  "music","song","piano","guitar","violin","drum","flute","trumpet","voice","band",
  "summer","winter","spring","autumn","morning","noon","evening","night","today","tomorrow",
  "game","puzzle","card","dice","ball","goal","score","team","match","player",
  "computer","mouse","keyboard","screen","code","server","cloud","data","robot","app",
  "star","moon","sun","planet","earth","mars","venus","jupiter","saturn","galaxy",
  "food","bread","rice","noodle","meat","fish","fruit","cake","soup","salad"
];

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.static("public")); // <-- serve static CSS

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });

/* ---------------------------- In-memory game state --------------------------- */
let players = new Map(); // socketId -> { name, score, gameMode, durationMin }
let game = {
  wordsSinceLastSpin: 0,
  nextSpinGap: rand5to10(),
  running: false,
  startAtMs: null,
  endAtMs: null,
  firstPlayerId: null,
  wordTimer: null,
  tickTimer: null,
  nextWordId: 1,
  activeWords: new Map(), // wordId -> { text, spawnAtMs }
};

/* --------------------------------- Helpers ---------------------------------- */
function broadcastPlayerList() {
  const list = [...players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score, gameMode: p.gameMode }));
  io.emit("player_list", { players: list, count: list.length });
}

function pickRandomWord() {
  if (gameMode == "normal"){
  return getShuffledWords();}
  else {
    return getShuffledClashWords();
  }
}

function chooseFirstPlayer() {
  const ids = [...players.keys()];
  return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
}

function stopGameTimers() {
  if (game.wordTimer) clearInterval(game.wordTimer);
  if (game.tickTimer) clearInterval(game.tickTimer);
  game.wordTimer = null;
  game.tickTimer = null;
}

function resetGameState(keepPlayers = true) {
  stopGameTimers();
  game = {
    wordsSinceLastSpin: 0,
    nextSpinGap: rand5to10(),
    running: false,
    startAtMs: null,
    endAtMs: null,
    firstPlayerId: null,
    wordTimer: null,
    tickTimer: null,
    nextWordId: 1,
    activeWords: new Map(),
  };
  if (keepPlayers) {
    players.forEach((p) => (p.score = 0));
  } else {
    players.clear();
  }
}

const checkGameMode = ()=>{
  const arr = Array.from(players.values())
  if (arr.every(pp => pp.gameMode === arr[0].gameMode)){
    gameMode = arr[0].gameMode;
  }
  return arr.every(pp => pp.gameMode === arr[0].gameMode)
}

function clampDuration(mins) {
  const n = Number(mins) || DEFAULT_GAME_DURATION_MIN;
  return Math.max(MIN_DURATION_MIN, Math.min(MAX_DURATION_MIN, n));
  }
  
  function getUniformDurationOrNull() {
  const arr = Array.from(players.values());
  if (arr.length === 0) return null;
  const first = arr[0].durationMin;
  if (arr.every(p => p.durationMin === first)) return first;
  return null;
  }

/* ---------------------------- Game lifecycle API ---------------------------- */
function startGame() {
  if (game.running || (players.size < 2 )) return; // require 2 players
  if (!checkGameMode()) {
    io.emit("game_mode_mismatch", { message: "Please change game mode" });
    return};
  
  const uniformDuration = getUniformDurationOrNull();
  if (!uniformDuration) {
    io.emit("duration_mismatch", { message: "Please select the same duration (1–5 min)." });
    return;
  }

  game.running = true;
  game.startAtMs = Date.now() + 1500;
  game.endAtMs = game.startAtMs + uniformDuration * 60 * 1000;
  game.firstPlayerId = chooseFirstPlayer();

  io.emit("game_start", {
    startAtMs: game.startAtMs,
    firstPlayerId: game.firstPlayerId,
    durationMin: uniformDuration,
    endAtMs: game.endAtMs,
  });

  game.tickTimer = setInterval(() => {
    const now = Date.now();
    const remainingMs = Math.max(0, game.endAtMs - now);
    io.emit("timer", { remainingMs });
    if (remainingMs <= 0) endGame();
  }, 1000);

  game.wordTimer = setInterval(() => {
    if (!game.running) return;

    const wordId = game.nextWordId++;
    const text = pickRandomWord();
    const spawnAtMs = Date.now();

    // --- SERVER-AUTHORITATIVE SPIN DECISION ---
    game.wordsSinceLastSpin += 1;
    let spin = false;
    if (game.wordsSinceLastSpin >= game.nextSpinGap) {
      spin = true;
      game.wordsSinceLastSpin = 0;
      game.nextSpinGap = rand5to10(); // next gap: 5–10 words
    }
    // ------------------------------------------

    game.activeWords.set(wordId, { text, spawnAtMs });
    io.emit("new_word", { id: wordId, text, spawnAtMs, spin }); // broadcast 'spin' flag
  }, WORD_SPAWN_MS);
}

function endGame() {
  stopGameTimers();
  game.running = false;

  const scoreList = [...players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score }));
  scoreList.sort((a, b) => b.score - a.score);
  const winner = scoreList[0] || { name: "N/A", score: 0 };

  io.emit("game_end", { winnerName: winner.name, scores: scoreList });
}

/* --------------------------------- Sockets ---------------------------------- */
io.on("connection", (socket) => {
  socket.on("join", ({ name, mode, durationMin }) => {
    players.set(socket.id, { 
        name: (name || "Player").slice(0, 20), 
        score: 0,
        gameMode: mode || 'normal', // 2. Store the gameMode
        durationMin: clampDuration(durationMin)
    });
    socket.emit("welcome", { message: `Welcome, ${players.get(socket.id).name}.` });
    broadcastPlayerList();
    if (players.size === 2 && !game.running) startGame();
});
  socket.on("typed", ({ wordId, text }) => {
    if (!game.running) return;
    const entry = game.activeWords.get(wordId);
    if (!entry) return;
    if (String(text) === entry.text) {
      game.activeWords.delete(wordId);
      const p = players.get(socket.id);
      if (p) {
        p.score += 1;
        io.emit("word_result", {
          wordId,
          correct: true,
          scorerId: socket.id,
          newScore: p.score,
        });
        broadcastPlayerList();
      }
    } else {
      socket.emit("word_result", { wordId, correct: false });
    }
  });

  socket.on("admin_reset", () => {
    resetGameState(true);
    io.emit("reset", {});
    broadcastPlayerList();
    if (players.size === 2) startGame();
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    broadcastPlayerList();
    if (players.size < 2 && game.running) {
      endGame();
    }
  });
});

/* ------------------------------ Server Admin UI ----------------------------- */
app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <meta charset="utf-8" />
    <title>Rainy Words Server</title>
    <link rel="stylesheet" href="/style.css" />

    <h1 class="title">Rainy Words – Server</h1>
    <div class="card">
      <div class="row">
        <b>Concurrent clients:</b> <span id="count" class="pill">0</span>
      </div>
      <div class="row">
        <b>Running:</b> <span id="running" class="pill">false</span>
      </div>
      <div class="actions">
        <button id="resetBtn" class="btn">Reset Game</button>
      </div>
      <pre id="players"></pre>
    </div>

    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <script>
      const socket = io({ transports:['websocket'] });
      const $ = (id)=>document.getElementById(id);

      socket.on('player_list', ({players,count})=>{
        $('count').textContent = count;
        const displayList = players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            gameMode: p.gameMode // Include the new property
        }));

        $('players').textContent = JSON.stringify(displayList, null, 2);
      });
      socket.on('game_start', ()=>{ $('running').textContent = 'true'; });
      socket.on('game_end', ()=>{ $('running').textContent = 'false'; });
      socket.on('reset', ()=>{ $('running').textContent = 'false'; });
      $('resetBtn').onclick = ()=> socket.emit('admin_reset');
    </script>
  `);
});

/* --------------------------------- Start ------------------------------------ */
server.listen(PORT, () => {
  console.log(`Rainy Words server running on :${PORT}`);
});