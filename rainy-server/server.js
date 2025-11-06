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
//var gameMode;

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
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const rooms = new Map();

/* ---------------------------- In-memory game state --------------------------- */
// let players = new Map(); // socketId -> { name, score, gameMode, durationMin }
// let game = {
//   wordsSinceLastSpin: 0,
//   nextSpinGap: rand5to10(),
//   running: false,
//   startAtMs: null,
//   endAtMs: null,
//   firstPlayerId: null,
//   wordTimer: null,
//   tickTimer: null,
//   nextWordId: 1,
//   activeWords: new Map(), // wordId -> { text, spawnAtMs }
// };
////
// === Freeze feature: track one-time usage per socket id ===
const usedFreeze = new Set();

/* --------------------------------- Helpers ---------------------------------- */
function broadcastPlayerList() {
  const list = [...players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score, gameMode: p.gameMode }));
  io.emit("player_list", { players: list, count: list.length });
}

function pickRandomWordByMode(mode) {
  return mode === "normal" ? getShuffledWords() : getShuffledClashWords();
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
   // ✅ Always reset scores, even if keeping players
  players.forEach((p) => (p.score = 0));

  if (!keepPlayers) {
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

function makeRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id;
  do {
    id = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(id));       // ห้ามชนกับห้องที่มีอยู่
  return id;
}
  
function broadcastRooms() {
  const summary = Array.from(rooms.values()).map(r => ({
    id: r.id,
    mode: r.mode,
    durationMin: r.durationMin,
    requiredPlayers: r.requiredPlayers,
    current: r.players.size,
    running: r.running,
  }));
  io.emit("room_list", summary);
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

    game.activeWords.set(wordId, { text, spawnAtMs, spin }); // 👈 store spin flag too
    io.emit("new_word", { id: wordId, text, spawnAtMs, spin });

  }, WORD_SPAWN_MS);
}

function endGame() {
  stopGameTimers();
  game.running = false;

  // ✅ Reset all scores for next round
  players.forEach((p) => (p.score = 0));

  const scoreList = [...players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score }));
  scoreList.sort((a, b) => b.score - a.score);
  const winner = scoreList[0] || { name: "N/A", score: 0 };

  io.emit("game_end", { winnerName: winner.name, scores: scoreList });
}

/* --------------------------------- Sockets ---------------------------------- */
io.on("connection", (socket) => {
  
  // console.log('A user connected:', socket.id);

// send current rooms right away so admin/client UI updates
socket.emit(
  'room_list',
  Array.from(rooms.values()).map(r => ({
    id: r.id,
    mode: r.mode,
    durationMin: r.durationMin,
    requiredPlayers: r.requiredPlayers,
    current: r.players.size,
    running: r.running,
  }))
);
  // Player creates a room
  socket.on("create_room", ({ name, mode, durationMin, playersWanted }) => {
  const id = makeRoomId();
  const room = {
    id,
    mode,
    durationMin: clampDuration(durationMin),
    requiredPlayers: Math.min(Math.max(playersWanted || 2, 1), 4),
    players: new Map(),                 // socketId -> { name, score }
    running: false,
    startAtMs: null,
    endAtMs: null,
    wordTimer: null,
    tickTimer: null,
    nextWordId: 1,
    activeWords: new Map(),             // wordId -> { text, spawnAtMs }
    wordsSinceLastSpin: 0,
    nextSpinGap: rand5to10(),
  };
  rooms.set(id, room);

  // Add creator to the room
  room.players.set(socket.id, { name, score: 0 });
  socket.join(id);
  socket.data.roomId = id;
  socket.emit("room_joined", { roomId: id });
  broadcastRooms();
  
  io.to(id).emit("player_list", {
    players: Array.from(room.players.entries()).map(([pid, p]) => ({
      id: pid, name: p.name, score: p.score,
    })),
    count: room.players.size,
  });

  // If single-player, start immediately
  if (room.requiredPlayers === 1) {
    startGameInRoom(room.id);
  }
  });

// Player joins an existing room
socket.on("join_room", ({ roomId, name }) => {
  const rid = String(roomId).trim().toUpperCase();
  const room = rooms.get(rid);
  if (!room || room.running) {
    return socket.emit("error_msg", { message: "Room not available" });
  }

  // Add player to room
  room.players.set(socket.id, { name, score: 0 });
  socket.join(rid);
  socket.data.roomId = rid;
  socket.emit("room_joined", { roomId: rid, mode: room.mode });
  broadcastRooms();

  io.to(rid).emit("player_list", {
    players: Array.from(room.players.entries()).map(([pid, p]) => ({
      id: pid,
      name: p.name,
      score: p.score,
    })),
    count: room.players.size,
  });

  if (room.players.size === room.requiredPlayers) {
    startGameInRoom(rid);
  }
});

socket.on("leave_room", ({ roomId } = {}) => {
  // ถ้า client ไม่ส่งมาก็อ่านจาก session
  const rid = String(roomId || socket.data.roomId || "").trim();
  if (!rid) return;

  const room = rooms.get(rid);
  if (!room) return;

  // เอาผู้เล่นออกจากห้อง
  room.players.delete(socket.id);
  socket.leave(rid);
  delete socket.data.roomId;

  // ถ้าไม่เหลือผู้เล่นในห้อง -> เคลียร์ timer และลบห้อง
  if (room.players.size === 0) {
    if (room.wordTimer) clearInterval(room.wordTimer);
    if (room.tickTimer) clearInterval(room.tickTimer);
    room.wordTimer = null;
    room.tickTimer = null;
    rooms.delete(rid);
  } else {
    // ยังมีคนอยู่ อัปเดตรายชื่อผู้เล่นในห้อง
    io.to(rid).emit("player_list", {
      players: Array.from(room.players.entries()).map(([pid, p]) => ({
        id: pid, name: p.name, score: p.score,
      })),
      count: room.players.size,
    });
  }

  // อัปเดตรายการห้องให้ทุกคน
  broadcastRooms();
});
  
socket.on("typed", ({ wordId, text }) => {
  const roomId = socket.data.roomId;
  const room = rooms.get(roomId);
  if (!room || !room.running) return;

  const entry = room.activeWords.get(wordId);
  if (!entry) return;

  if (String(text).toLowerCase() === entry.text.toLowerCase()) {
    room.activeWords.delete(wordId);

    const player = room.players.get(socket.id);
    if (player) {
      // Give 2 points if the word was spinning, otherwise 1
      player.score += entry.spin ? 2 : 1;


      io.to(roomId).emit("word_result", {
        wordId,
        correct: true,
        scorerId: socket.id,
        newScore: player.score,
      });

      io.to(roomId).emit("player_list", {
        players: Array.from(room.players.entries()).map(([id, p]) => ({
          id,
          name: p.name,
          score: p.score,
        })),
        count: room.players.size,
      });
    }
  } else {
    socket.emit("word_result", { wordId, correct: false });
  }
});


  // === Freeze feature events (added) ===
  socket.on("freeze:request", ({ byName }) => {
    if (usedFreeze.has(socket.id)) {
      socket.emit("freeze:denied", { reason: "already-used" });
      return;
    }
    usedFreeze.add(socket.id);

    const DURATION_MS = 10000; // 10 seconds
    const roomId = socket.data.roomId;
    socket.to(roomId).emit("freeze:apply", {
      duration: DURATION_MS,
      byName: byName || "Someone",
    });

    socket.emit("freeze:ack", { used: true });
  });

  socket.on("admin_reset_all", () => {
    // Loop over all rooms
    for (const [roomId, room] of rooms.entries()) {
      // stop timers
      if (room.wordTimer) clearInterval(room.wordTimer);
      if (room.tickTimer) clearInterval(room.tickTimer);
      room.wordTimer = null;
      room.tickTimer = null;
      room.running = false;
  
      // notify clients in each room
      io.to(roomId).emit("force_leave", { reason: "admin_reset" });
  
      // make each player leave
      const clientIds = io.sockets.adapter.rooms.get(roomId);
      if (clientIds) {
        for (const sid of clientIds) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.leave(roomId);
            s.data.roomId = null;
          }
        }
      }
      rooms.delete(roomId);
    }
  
    // update everyone
    broadcastRooms();
  });
  

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (room.players.delete(socket.id)) {
        if (room.players.size === 0) rooms.delete(room.id);
        broadcastRooms();
        break;
      }
    }
  });
});

/* ------------------------------ Server Admin UI ----------------------------- */

// the new game starter function
function startGameInRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.running) return;
  room.running = true;

  room.startAtMs = Date.now() + 1500;
  room.endAtMs   = room.startAtMs + room.durationMin * 60 * 1000;

  io.to(roomId).emit("game_start", {
    roomId,
    startAtMs: room.startAtMs,
    durationMin: room.durationMin,
    endAtMs: room.endAtMs,
    players: Array.from(room.players.values()).map(p => p.name),
  });

  // per-room timer
  room.tickTimer = setInterval(() => {
    const remainingMs = Math.max(0, room.endAtMs - Date.now());
    io.to(roomId).emit("timer", { remainingMs });
    if (remainingMs <= 0) endGameInRoom(roomId);
  }, 1000);

  // per-room word spawner with spin flag
  room.wordTimer = setInterval(() => {
    if (!room.running) return;

    const wordId = room.nextWordId++;
    const text = pickRandomWordByMode(room.mode);
    const spawnAtMs = Date.now();

    room.wordsSinceLastSpin += 1;
    let spin = false;
    if (room.wordsSinceLastSpin >= room.nextSpinGap) {
      spin = true;
      room.wordsSinceLastSpin = 0;
      room.nextSpinGap = rand5to10();
    }

    room.activeWords.set(wordId, { text, spawnAtMs, spin });
    io.to(roomId).emit("new_word", { id: wordId, text, spawnAtMs, spin });
  }, WORD_SPAWN_MS);
}

function endGameInRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.wordTimer) clearInterval(room.wordTimer);
  if (room.tickTimer) clearInterval(room.tickTimer);
  room.wordTimer = null;
  room.tickTimer = null;
  room.running = false;

  const scores = Array.from(room.players.entries())
    .map(([id, p]) => ({ id, name: p.name, score: p.score }))
    .sort((a,b) => b.score - a.score);

  const winner = scores[0] || { name: "N/A", score: 0 };
  io.to(roomId).emit("game_end", { winnerName: winner.name, scores });
  broadcastRooms();
}

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
  const socket = io({ transports: ['websocket'] });
  const $ = (id) => document.getElementById(id);

  // Optional: see every event in console
  socket.onAny((event, ...args) => console.debug('[socket]', event, args));

  // Show all rooms and compute totals
  socket.on('room_list', (rooms) => {
    const total = rooms.reduce((sum, r) => sum + (r.current || 0), 0);
    $('count').textContent = total;
    $('running').textContent = rooms.some(r => r.running) ? 'true' : 'false';
    $('players').textContent = JSON.stringify(rooms, null, 2);
  });

  // (Keep old hooks if you still emit them per-room; otherwise safe to ignore)
  socket.on('game_start', () => { $('running').textContent = 'true'; });
  socket.on('game_end',   () => { $('running').textContent = 'false'; });
  socket.on('reset',      () => { $('running').textContent = 'false'; });

  // Reset current socket's room (room-scoped reset)
  $('resetBtn').onclick = () => socket.emit('admin_reset_all');
</script>
`);
});

/* --------------------------------- Start ------------------------------------ */
server.listen(PORT, () => {
  console.log(`Rainy Words server running on :${PORT}`);
});
