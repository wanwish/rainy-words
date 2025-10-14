import React, { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import goblinImg from '../assets/goblin.webp';

// 🎵 audio (must exist in src/assets)
import clashTheme from '../assets/Clash Royale Sudden Death Song EXTENDED 1 hour.mp3';
import megaknightSfx from '../assets/Mega Knight Evolution new Voice lines_1.mp3';

// Raindrop background component
interface RainBackgroundProps {
  gameMode: 'normal' | 'clash-royale';
}

const RainBackground = ({ gameMode }: RainBackgroundProps) => (
  <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
    <style>{`
      @keyframes rainFall {
        0% { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 0; }
        10% { opacity: 0.8; }
        90% { opacity: 0.8; }
        100% { transform: translateY(110vh) translateX(20px) rotate(180deg); opacity: 0; }
      }
      @keyframes rainGlow {
        0%, 100% { filter: drop-shadow(0 0 2px hsl(199 89% 48% / 0.3)); }
        50% { filter: drop-shadow(0 0 8px hsl(271 81% 56% / 0.5)); }
      }
      .raindrop {
        animation: rainFall 3s linear infinite, rainGlow 2s ease-in-out infinite;
        background: linear-gradient(180deg,
          hsl(199 89% 48% / 0.8) 0%,
          hsl(271 81% 56% / 0.6) 50%,
          hsl(199 89% 48% / 0.3) 100%
        );
        border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
        position: absolute;
      }
    `}</style>

    {Array.from({ length: 80 }).map((_, i) => {
      const commonStyle = {
        left: `${Math.random() * 100}%`,
        top: '0%',
        animationName: 'rainFall',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        animationDuration: `${Math.random() * 2 + 2}s`,
        animationDelay: `${Math.random() * 3}s`,
        position: 'absolute' as const,
      };

      if (gameMode === 'normal') {
        return (
          <div
            key={i}
            className="raindrop"
            style={{
              ...commonStyle,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 15 + 8}px`,
            }}
          />
        );
      } else {
        return (
          <img
            key={i}
            src={goblinImg}
            alt="character"
            style={{
              ...commonStyle,
              width: 70,
              height: 70,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        );
      }
    })}
  </div>
);

// Types
interface PlayerRow { id: string; name: string; score: number }
interface RoomSummary { id: string; mode: "normal" | "clash-royale" | string; durationMin: number; requiredPlayers: number; current: number; running: boolean }
interface FallingWord { id: number; text: string; top: number; left: number }

type GameState = "start" | "waiting" | "countdown" | "playing" | "gameover";

// Utils
const formatTime = (secs: number) => {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function Index() {
  // ----- Core state -----
  const [username, setUsername] = useState("");
  const [gameMode, setGameMode] = useState<"normal" | "clash-royale">("normal");
  const [durationMin, setDurationMin] = useState<number>(3);
  const [playersWanted, setPlayersWanted] = useState<number>(2); // 1–4

  const [gameState, setGameState] = useState<GameState>("start");
  const [countdown, setCountdown] = useState(3);
  const [seconds, setSeconds] = useState(durationMin * 60);
  const [score, setScore] = useState(0);

  const [roomList, setRoomList] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState('');
  const [playerList, setPlayerList] = useState<PlayerRow[]>([]);

  // Falling words + typing
  const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
  const [typedWord, setTypedWord] = useState("");
  const [spinningWordIds, setSpinningWordIds] = useState<Set<number>>(new Set());

  // 🎧 Sound controls (Clash mode only)
  const [soundOn, setSoundOn] = useState(true);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const sfxAudioRef = useRef<HTMLAudioElement | null>(null);

  // Freeze feature
  const [freezeUsed, setFreezeUsed] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezeEndsAt, setFreezeEndsAt] = useState(0);

  // Sockets
  const socketRef = useRef<Socket | null>(null);
  const mySocketIdRef = useRef<string | null>(null);

  // Ensure socket (singleton)
  const ensureSocket = () => {
    if (!socketRef.current) {
      socketRef.current = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3001", {
        transports: ["websocket"],
      });
      setupSocketListeners();
    }
    return socketRef.current;
  };

  // ----- Socket listeners -----
  const setupSocketListeners = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("connect", () => {
      mySocketIdRef.current = socket.id;
    });

    socket.on('player_list', ({ players }: { players: {id:string; name:string; score:number}[] }) => {
      setPlayerList(players);
    });

    // 🏠 Rooms
    socket.on("room_list", (list: RoomSummary[]) => {
      setRoomList(list || []);
    });

    socket.on("room_joined", ({ roomId }: { roomId: string }) => {
      setRoomId(roomId);
      setGameState("waiting");
    });

    socket.on("error_msg", ({ message }: { message: string }) => {
      alert(message);
    });

    // 🎮 Game
    socket.on("game_start", (p: { roomId: string; startAtMs: number; durationMin: number; endAtMs: number; players: string[] }) => {
      setFallingWords([]);
      setTypedWord("");
      setScore(0);
      setSeconds(p.durationMin * 60);
      setGameState("countdown");
      setCountdown(3);

      // Optional: play bg music when playing starts later
      setTimeout(() => {
        setGameState("playing");
        if (soundOn) {
          try { bgAudioRef.current?.play(); } catch {}
        }
      }, 1500);
    });

    socket.on("timer", ({ remainingMs }: { remainingMs: number }) => {
      setSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
    });

    socket.on('game_end', ({ winnerName }: { winnerName: string }) => {
      setWinnerName(winnerName);
      setGameState('gameover');
      // stop bg music
      bgAudioRef.current?.pause();

      setFreezeUsed(false); // ✅ Allow Freeze again next round
      setIsFrozen(false);   // ✅ Ensure UI unfrozen

      if (bgAudioRef.current) bgAudioRef.current.currentTime = 0;
    });

    socket.on("new_word", ({ id, text, spawnAtMs, spin }: { id: number; text: string; spawnAtMs: number; spin?: boolean }) => {
      setFallingWords((prev) => [
        ...prev,
        { id, text, top: 0, left: Math.floor(Math.random() * 80) + 10 },
      ]);
      if (spin) setSpinningWordIds(prev => new Set(prev).add(id));
    });

    socket.on("word_result", ({ wordId, correct, scorerId, newScore }: { wordId: number; correct: boolean; scorerId: string; newScore: number }) => {
      if (correct) {
        setFallingWords(prev => prev.filter(w => w.id !== wordId));
        if (scorerId === mySocketIdRef.current) {
          setScore(newScore);
          try { sfxAudioRef.current?.play(); } catch {}
        }
      }
    });

    // ❄ Freeze feature
    socket.on("freeze:apply", ({ duration, byName }: { duration: number; byName: string }) => {
      setIsFrozen(true);
      setFreezeEndsAt(Date.now() + duration);
      const t = setTimeout(() => setIsFrozen(false), duration);
      return () => clearTimeout(t);
    });

    socket.on("freeze:ack", () => setFreezeUsed(true));
  };

  // Mount socket once
  useEffect(() => {
    ensureSocket();
    return () => {
      // detach listeners on unmount
      const s = socketRef.current;
      if (!s) return;
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Falling animation while playing
  useEffect(() => {
    if (gameState !== "playing" || isFrozen) return;
    const fall = setInterval(() => {
      setFallingWords((prev) =>
        prev
          .map((w) => ({ ...w, top: w.top + 1 }))
          .filter((w) => w.top <= 95)
      );
    }, 50);
    return () => clearInterval(fall);
  }, [gameState, isFrozen]);

  useEffect(() => {
    const bg = new Audio(clashTheme);
    bg.loop = true;
    bg.volume = 0.35;
    bg.preload = 'auto';
  
    const sfx = new Audio(megaknightSfx);
    sfx.volume = 0.9;
    sfx.preload = 'auto';
  
    bgAudioRef.current = bg;
    sfxAudioRef.current = sfx;
  
    return () => {
      try { bg.pause(); sfx.pause(); } catch {}
      bgAudioRef.current = null;
      sfxAudioRef.current = null;
    };
  }, []);

  // Input typing handler
  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTypedWord(value);
    if (!value.trim()) return;

    // Try match the earliest word by exact text
    const match = fallingWords.find((w) => w.text === value.trim());
    if (match) {
      setTypedWord("");
      socketRef.current?.emit("typed", { wordId: match.id, text: match.text });
    }
  };

  // Freeze button
  const onFreezeClick = () => {
    if (freezeUsed || gameState !== "playing") return;
    socketRef.current?.emit("freeze:request", { byName: username || "Player" });
  };

  // Start/Create Room
  const onClickStart = () => {
    if (!username.trim()) return;
    ensureSocket();
    socketRef.current?.emit("create_room", {
      name: username.trim(),
      mode: gameMode,
      durationMin,
      playersWanted,
    });
  };

  // Back to home
  const goHome = () => {
    setGameState("start");
    setPlayerList([]);
    setFallingWords([]);
    setTypedWord("");
    setScore(0);
    setRoomId(null);
    setSeconds(durationMin * 60);
  };

  // ---------- VIEWS ----------
  // Start Screen
  if (gameState === "start") {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-5xl font-extrabold mb-6 text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
            Rainy Words
          </h1>

          {/* Game mode */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3 font-semibold">GAME MODE</p>
            <div className="grid grid-cols-2 gap-2">
              {(["normal", "clash-royale"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGameMode(m)}
                  className={`px-3 py-3 rounded-xl font-bold border-2 transition-all ${
                    gameMode === m
                      ? "bg-primary/20 border-primary text-primary shadow-[var(--glow-primary)]"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {m === "normal" ? "Normal" : "Clash Royale"}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3 font-semibold">DURATION (MINUTES)</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setDurationMin(m);
                    setSeconds(m * 60);
                  }}
                  className={`px-3 py-2 rounded-xl font-bold border-2 transition-all ${
                    durationMin === m
                      ? "bg-primary/20 border-primary text-primary shadow-[var(--glow-primary)]"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Players wanted */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3 font-semibold">PLAYERS</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPlayersWanted(n)}
                  className={`px-3 py-2 rounded-xl font-bold border-2 transition-all ${
                    playersWanted === n
                      ? "bg-primary/20 border-primary text-primary shadow-[var(--glow-primary)]"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">First player’s choice sets the lobby size.</p>
          </div>

          {/* Name */}
          <div className="mb-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-xl px-4 py-3 bg-input border border-border"
            />
          </div>

          {/* Buttons */}
          <button
            onClick={onClickStart}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg transition-all"
          >
            Create Room
          </button>

          {/* Open Rooms */}
          <div className="mt-6 w-full">
            <p className="text-sm font-semibold mb-2">Open Rooms</p>
            <div className="space-y-2">
              {roomList.length === 0 && (
                <div className="text-xs text-muted-foreground">No rooms yet — create one!</div>
              )}
              {roomList.map((r) => (
                <div key={r.id} className="flex justify-between items-center border p-2 rounded-lg">
                  <span className="text-sm">
                    <b>{r.id}</b> — {r.mode}, {r.current}/{r.requiredPlayers}, {r.durationMin}m {r.running ? "• running" : ""}
                  </span>
                  {!r.running && (
                    <button
                    onClick={() => {
                      // Always ensure socket exists before emitting
                      ensureSocket();
                  
                      // Allow join even if name input is empty
                      const name =
                        (username && username.trim()) || `Player-${Math.floor(Math.random() * 1000)}`;
                  
                      console.debug("joining room", r.id, "as", name); // debug
                      socketRef.current?.emit("join_room", { roomId: r.id, name });
                    }}
                    className="text-sm px-3 py-1 border rounded hover:bg-muted"
                  >
                    Join
                  </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Waiting Screen
  if (gameState === "waiting") {
    const currentRoom = roomList.find((r) => r.id === roomId);
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-4xl font-extrabold mb-6 text-primary">Waiting Room</h1>
          <div className="mb-3 text-sm text-muted-foreground">
            Room: <b>{roomId}</b>
          </div>

          <div className="mb-6">
            <p className="text-lg text-muted-foreground mb-4">Players in lobby:</p>
            <div className="space-y-2">
              {playerList.length === 0 && (
                <div className="text-xs text-muted-foreground">Waiting for players to join…</div>
              )}
              {playerList.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border transition-all ${
                    player.id === (mySocketIdRef.current || socketRef.current?.id)
                      ? "bg-primary/20 border-primary shadow-[var(--glow-primary)]"
                      : "bg-muted border-border"
                  }`}
                >
                  <p className="font-semibold text-foreground">
                    {player.name} {player.id === (mySocketIdRef.current || socketRef.current?.id) && "(You)"}
                  </p>
                </div>
              ))}
            </div>

            {currentRoom && (
              <p className="mt-3 text-sm text-muted-foreground">
                Waiting for <b>{currentRoom.requiredPlayers}</b> player(s): {currentRoom.current}/{currentRoom.requiredPlayers} joined
              </p>
            )}
          </div>

          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
            <p className="ml-2">Waiting for game to start</p>
          </div>

          <button onClick={goHome} className="mt-4 px-4 py-2 rounded-lg border text-sm hover:bg-muted">Back to Home</button>
        </div>
      </div>
    );
  }

  // Countdown Screen
  if (gameState === "countdown") {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-6xl font-extrabold mb-6 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse">
            Rainy Words
          </h1>
          <h2 className="text-5xl font-extrabold mb-2 text-primary">{countdown}</h2>
          <p className="text-sm text-muted-foreground">Get ready…</p>
        </div>
      </div>
    );
  }

  // Game Over
  if (gameState === 'gameover') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-5xl font-extrabold mb-6 text-destructive">Game Over</h1>
          <p className="text-3xl mb-4">Your Score: <span className="text-primary font-bold">{score}</span></p>
          {winnerName && <p className="text-2xl mb-6 text-secondary">Winner: <span className="font-bold">{winnerName}</span></p>}
          <button
            onClick={() => {
              setGameState('start');
              setPlayerList([]);
              setSeconds(durationMin * 60);
            }}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg transition-all"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // Playing Screen
  return (
    <div className="relative flex flex-col items-center min-h-screen w-screen bg-background text-foreground overflow-hidden">
      <RainBackground gameMode={gameMode} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl p-4 pt-8">
        <div className="flex justify-between items-start w-full mb-6 p-6 rounded-2xl bg-card/80 border border-border backdrop-blur-md shadow-xl">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Time Remaining</p>
            <h1 className="text-4xl font-bold text-primary">{formatTime(seconds)}</h1>
          </div>

          {/* Sound toggle for clash-royale */}
          {gameMode === "clash-royale" && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  if (!next) {
                    try { bgAudioRef.current?.pause(); sfxAudioRef.current?.pause(); } catch {}
                  }
                }}
                className="px-3 py-2 rounded-lg border bg-muted/50 hover:bg-muted transition"
                title={soundOn ? "Sound: On" : "Sound: Off"}
              >
                {soundOn ? "🔊 Sound: On" : "🔇 Sound: Off"}
              </button>
            </div>
          )}

          {/* Freeze power-up */}
          <div className="flex items-center gap-3">
            <button
              onClick={onFreezeClick}
              disabled={freezeUsed || gameState !== "playing"}
              className="px-3 py-2 rounded-lg border bg-primary/20 border-primary text-primary hover:bg-primary/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={freezeUsed ? "You already used Freeze" : "Freeze all opponents for 10s"}
            >
              ❄ Freeze (1×)
            </button>
          </div>

          {/* Scoreboard: show every player's score */}
          <div className="flex items-center gap-3">
            {playerList.map((p) => {
              const isMe = p.id === (mySocketIdRef.current || socketRef.current?.id);
              return (
              <div
                  key={p.id}
                  className={`px-3 py-2 rounded-lg border text-center min-w-[72px] ${
                  isMe
                    ? 'bg-primary/20 border-primary'
                    : 'bg-muted/50 border-border'
                }`}
                  title={isMe ? `${p.name} (You)` : p.name}
                >
                  <div className="text-xl font-extrabold text-primary leading-none">{p.score}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[100px]">{isMe ? `${p.name} (You)` : p.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="w-full relative bg-card/40 border border-border rounded-2xl shadow-inner backdrop-blur-sm mb-6 overflow-hidden"
          style={{ minHeight: "450px" }}
        >
          {fallingWords.map((word) => {
            const isSpinning = spinningWordIds.has(word.id);
            return (
              <div
                key={word.id}
                className={`absolute text-3xl font-bold transition-all ease-linear text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)] ${
                  isSpinning ? "spinning-word" : ""
                }`}
                style={{ top: `${word.top}%`, left: `${word.left}%` }}
              >
                {word.text}
              </div>
            );
          })}
        </div>

        <div className="w-full p-6 bg-card/80 border border-border backdrop-blur-md rounded-2xl shadow-xl">
          <input
            type="text"
            autoFocus
            value={typedWord}
            onChange={handleTyping}
            className="w-full p-5 rounded-xl bg-input text-foreground text-2xl text-center placeholder-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            placeholder="Type the words here..."
          />
        </div>
      </div>

      {/* Frozen overlay */}
      {isFrozen && (
        <div className="fixed inset-0 z-[9999] grid place-items-center pointer-events-none">
          <div className="absolute inset-0 bg-[rgba(0,20,40,0.55)] backdrop-blur-sm" />
          <div className="relative px-8 py-6 rounded-2xl border border-[rgba(150,200,255,0.25)] bg-[linear-gradient(180deg,rgba(40,70,110,6),rgba(20,40,70,7))] shadow-[0_10px_30px_rgba(0,0,0,6),_inset_0_0_80px_rgba(150,220,255,15)] text-center">
            <div className="text-5xl font-extrabold tracking-widest text-[rgb(233,246,255)] drop-shadow-[0_0_12px_rgba(100,220,255,35)]">
              FROZEN
            </div>
            <div className="mt-2 text-lg font-bold text-[rgb(207,232,255)]">
              {Math.max(0, Math.ceil((freezeEndsAt - Date.now()) / 1000))}s
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
