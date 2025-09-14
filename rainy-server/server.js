import { getShuffledWords } from "./wordList.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*"; // set to your React URL in prod
const GAME_DURATION_MS = 10000; //5 * 60 * 1000; // 5 minutes
const WORD_SPAWN_MS = 3000; // new word every 3s (tweak as you like)

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
let players = new Map(); // socketId -> { name, score }
let game = {
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
  const list = [...players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score }));
  io.emit("player_list", { players: list, count: list.length });
}

function pickRandomWord() {
  return getShuffledWords();
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

/* ---------------------------- Game lifecycle API ---------------------------- */
function startGame() {
  if (game.running || players.size < 2) return; // require 2 players
  game.running = true;
  game.startAtMs = Date.now() + 1500;
  game.endAtMs = game.startAtMs + GAME_DURATION_MS;
  game.firstPlayerId = chooseFirstPlayer();

  io.emit("game_start", {
    startAtMs: game.startAtMs,
    firstPlayerId: game.firstPlayerId,
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
    game.activeWords.set(wordId, { text, spawnAtMs });
    io.emit("new_word", { id: wordId, text, spawnAtMs });
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
  socket.on("join", ({ name }) => {
    players.set(socket.id, { name: (name || "Player").slice(0, 20), score: 0 });
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
        $('players').textContent = JSON.stringify(players, null, 2);
      });
      socket.on('game_start', ()=>{ $('running').textContent = 'true'; });
      socket.on('game_end', ()=>{ $('running').textContent = 'false'; });

      $('resetBtn').onclick = ()=> socket.emit('admin_reset');
    </script>
  `);
});

/* --------------------------------- Start ------------------------------------ */
server.listen(PORT, () => {
  console.log(`Rainy Words server running on :${PORT}`);
});
