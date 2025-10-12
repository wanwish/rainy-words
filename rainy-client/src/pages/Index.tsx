import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
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

// Helper: format time as MM:SS
const formatTime = (secs: number) => {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

interface FallingWord { id: string; text: string; top: number; left: number; }
interface Player { id: string; name: string; score: number; gameMode: string; }

function Index() {
  const [username, setUsername] = useState("");
  const [gameMode, setGameMode] = useState<'normal' | 'clash-royale'>('normal');
  const [gameState, setGameState] = useState<'start' | 'waiting' | 'countdown' | 'playing' | 'gameover'>('start');
  const [countdown, setCountdown] = useState(3);
  const [seconds, setSeconds] = useState(3 * 60);
  const [score, setScore] = useState(0);
  const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
  const [typedWord, setTypedWord] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [durationMin, setDurationMin] = useState<number>(3);
  const [mismatchReason, setMismatchReason] = useState<string | null>(null);

  // ✅ Spinning words: server-authoritative IDs
  const [spinningWordIds, setSpinningWordIds] = useState<Set<string>>(new Set());

  // 🎧 Sound controls (Clash mode only)
  const [soundOn, setSoundOn] = useState(true);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const sfxAudioRef = useRef<HTMLAudioElement | null>(null);

  const socketRef = useRef<any>(null);
  const mySocketIdRef = useRef<string | null>(null);
  const serverURL = useMemo(() => import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', []);

  const goHome = () => {
    setGameState('start');
    setScore(0);
    setMismatchReason(null);
    setSeconds(300);
    setSpinningWordIds(new Set());
    // ensure silence when leaving
    bgAudioRef.current?.pause();
    if (bgAudioRef.current) bgAudioRef.current.currentTime = 0;
  };

  // 🎵 Initialize audio once
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

  // 🔓 Unlock audio on first user interaction (covers mobile & desktop)
  const unlockAudio = () => {
    const bg = bgAudioRef.current;
    const sfx = sfxAudioRef.current;

    if (bg) {
      bg.muted = true;
      bg.play().then(() => {
        bg.pause();
        bg.currentTime = 0;
        bg.muted = false;
      }).catch(() => {});
    }
    if (sfx) {
      const prev = sfx.volume;
      sfx.volume = 0;
      sfx.play().then(() => {
        sfx.pause();
        sfx.currentTime = 0;
        sfx.volume = prev;
      }).catch(() => { sfx.volume = prev; });
    }
  };

  useEffect(() => {
    const oneTimeUnlock = () => unlockAudio();
    window.addEventListener('pointerdown', oneTimeUnlock, { once: true });
    return () => window.removeEventListener('pointerdown', oneTimeUnlock);
  }, []);

  // 🌧️ Falling animation
  useEffect(() => {
    if (gameState !== 'playing') return;
    const fall = setInterval(() => {
      setFallingWords((prev) =>
        prev.map(w => ({ ...w, top: w.top + 1 })).filter(w => w.top <= 95)
      );
    }, 50);
    return () => clearInterval(fall);
  }, [gameState]);

  // 🔌 Socket setup
  const setupSocketListeners = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('connect', () => {
      mySocketIdRef.current = socket.id;
    });

    socket.on('player_list', ({ players }: { players: Player[] }) => {
      setPlayerList(players);
      const me = players.find(p => p.id === (mySocketIdRef.current || socketRef.current?.id));
      if (me) setScore(me.score);
    });

    socket.on('game_start', () => {
      setGameState('countdown');
      setCountdown(3);
      setFallingWords([]);
      setTypedWord('');
      setScore(0);
      setSpinningWordIds(new Set());
      // Start bg only in Clash
      if (gameMode === 'clash-royale' && soundOn) {
        bgAudioRef.current?.play().catch(() => {});
      }
    });

    socket.on('timer', ({ remainingMs }: { remainingMs: number }) => {
      const s = Math.max(0, Math.floor(remainingMs / 1000));
      setSeconds(s);
      if (s <= 0 && gameState === 'playing') setGameState('gameover');
    });

    // ✅ Trust server spin flag only
    socket.on('new_word', ({ id, text, spin }: { id: string; text: string; spin?: boolean }) => {
      const left = Math.random() * 70 + 10;
      setFallingWords(prev => [...prev, { id, text, top: 0, left }]);
      if (spin) setSpinningWordIds(prev => new Set([...prev, id]));
    });

    socket.on('word_result', ({ wordId, correct, scorerId, newScore }: any) => {
      if (!correct) return;

      setFallingWords(prev => prev.filter(w => w.id !== wordId));
      setSpinningWordIds(prev => {
        const next = new Set(prev);
        next.delete(wordId);
        return next;
      });

      const myId = mySocketIdRef.current || socketRef.current?.id; // robust fallback
      if (scorerId === myId && typeof newScore === 'number') {
        setScore(newScore);
        setTypedWord('');

        // 🔊 Mega Knight SFX ONLY in Clash mode, only for the scorer
        if (gameMode === 'clash-royale' && soundOn && sfxAudioRef.current) {
          const sfx = sfxAudioRef.current;
          try {
            sfx.currentTime = 0;
            // play() returns a Promise; ignore errors to avoid unhandled rejections
            sfx.play().catch(() => {});
          } catch {}
        }
      }
    });

    socket.on('game_end', ({ winnerName }: { winnerName: string }) => {
      setWinnerName(winnerName);
      setGameState('gameover');
      // stop bg music
      bgAudioRef.current?.pause();
      if (bgAudioRef.current) bgAudioRef.current.currentTime = 0;
    });

    socket.on('reset', () => {
      setFallingWords([]);
      setScore(0);
      setSeconds(durationMin * 60);
      setGameState('start');
      setSpinningWordIds(new Set());
      bgAudioRef.current?.pause();
      if (bgAudioRef.current) bgAudioRef.current.currentTime = 0;
    });

    socket.on('game_mode_mismatch', ({ message }) => {
      alert(message);
      const el = document.getElementById("status");
      if (el) el.textContent = message;
      setMismatchReason(message || "Game mode mismatch");
    });

    socket.on('duration_mismatch', ({ message }) => {
      alert(message);
      const el = document.getElementById("status");
      if (el) el.textContent = message;
      setMismatchReason(message || "Duration mismatch");
    });
  };

  const ensureSocket = () => {
    if (socketRef.current?.connected) return socketRef.current;
    socketRef.current = io(serverURL, { transports: ['websocket'] });
    setupSocketListeners();
    return socketRef.current;
  };

  // ⏱️ Countdown
  useEffect(() => {
    if (gameState !== 'countdown') return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setGameState('playing');
    }
  }, [gameState, countdown]);

  // ✍️ Typing
  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setTypedWord(value);
    const hit = fallingWords.find(w => String(w.text).toLowerCase() === value);
    if (!hit) return;
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('typed', { wordId: hit.id, text: hit.text });
  };

  // ▶️ Join
  const onClickStart = () => {
    if (!username.trim()) return;
    const socket = ensureSocket();

    // 🔓 ensure this tab can play audio later
    unlockAudio();

    socket.emit('join', { name: username.trim(), mode: gameMode, durationMin });
    setGameState('waiting');

    // Prime bg only in Clash (Normal mode must stay silent)
    if (gameMode === 'clash-royale' && soundOn) {
      bgAudioRef.current?.play().catch(() => {});
    }
  };

  // Enforce silence in Normal; allow bg in Clash while playing
  useEffect(() => {
    if (gameMode !== 'clash-royale') {
      bgAudioRef.current?.pause();
      if (bgAudioRef.current) bgAudioRef.current.currentTime = 0;
    } else if (soundOn && gameState === 'playing') {
      bgAudioRef.current?.play().catch(() => {});
    }
  }, [gameMode, gameState, soundOn]);

  // ========================= UI BELOW =========================

  // Start
  if (gameState === 'start') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-6xl font-extrabold mb-6 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse">
            Rainy Words
          </h1>

          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3 font-semibold">SELECT GAME MODE</p>
            <div className="flex gap-3">
              <button
                onClick={() => setGameMode('normal')}
                className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all duration-200 border-2 ${
                  gameMode === 'normal'
                    ? 'bg-primary/20 border-primary text-primary shadow-[var(--glow-primary)]'
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setGameMode('clash-royale')}
                className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all duration-200 border-2 ${
                  gameMode === 'clash-royale'
                    ? 'bg-secondary/20 border-secondary text-secondary shadow-[var(--glow-secondary)]'
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-secondary/50'
                }`}
              >
                Clash Royale
              </button>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3 font-semibold">DURATION (MINUTES)</p>
            <div className="grid grid-cols-5 gap-2">
              {[1,2,3,4,5].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setDurationMin(m); setSeconds(m * 60); }}
                  className={`px-3 py-2 rounded-xl font-bold border-2 transition-all ${
                    durationMin === m
                      ? 'bg-primary/20 border-primary text-primary shadow-[var(--glow-primary)]'
                      : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
            <p id="status" className="mt-2 text-xs text-muted-foreground">
              Every player have to select same time duration.
            </p>
          </div>

          <input
            className="w-full p-4 rounded-xl bg-input text-foreground placeholder-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent mb-6 transition-all"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onClickStart()}
          />
          <button
            onClick={onClickStart}
            disabled={!username.trim()}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[var(--glow-primary)] disabled:hover:shadow-none"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  // Waiting
  if (gameState === 'waiting') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />

        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-4xl font-extrabold mb-6 text-primary">Waiting Room</h1>

          <div className="mb-6">
            <p className="text-lg text-muted-foreground mb-4">Players in lobby:</p>
            <div className="space-y-2">
              {playerList.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border transition-all ${
                    player.id === (mySocketIdRef.current || socketRef.current?.id)
                      ? 'bg-primary/20 border-primary shadow-[var(--glow-primary)]'
                      : 'bg-muted border-border'
                  }`}
                >
                  <p className="font-semibold text-foreground">
                    {player.name} {player.id === (mySocketIdRef.current || socketRef.current?.id) && '(You)'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Sound toggle ONLY in Clash mode */}
          {gameMode === 'clash-royale' && (
            <div className="mt-2">
              <button
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  if (!next) {
                    bgAudioRef.current?.pause();
                    sfxAudioRef.current?.pause();
                  } else if (gameState === 'playing') {
                    bgAudioRef.current?.play().catch(() => {});
                  }
                }}
                className="px-3 py-2 rounded-lg border bg-muted/50 hover:bg-muted transition"
                title={soundOn ? 'Sound: On' : 'Sound: Off'}
              >
                {soundOn ? '🔊 Sound: On' : '🔇 Sound: Off'}
              </button>
            </div>
          )}

          {mismatchReason && (
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 p-3 rounded-xl border bg-card shadow-lg">
              <span className="text-sm">{mismatchReason}</span>
              <button
                onClick={goHome}
                className="px-3 py-1.5 rounded-lg border bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/80"
              >
                Back to Home
              </button>
            </div>
          )}

          <div className="flex items-center justify-center space-x-2 text-muted-foreground mt-6">
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            <p className="ml-2">Waiting for game to start</p>
          </div>
        </div>
      </div>
    );
  }

  // Countdown
  if (gameState === 'countdown') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground gameMode={gameMode} />
        <div className="relative z-10 text-center">
          <h2 className="text-3xl font-bold mb-8 text-primary">Get Ready!</h2>
          <div className="text-[12rem] font-extrabold bg-gradient-to-br from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse">{countdown}</div>
          <p className="text-2xl text-muted-foreground mt-8">Game starts soon...</p>
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

  // Playing
  return (
    <div className="relative flex flex-col items-center min-h-screen w-screen bg-background text-foreground overflow-hidden">
      <RainBackground gameMode={gameMode} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl p-4 pt-8">
        <div className="flex justify-between items-start w-full mb-6 p-6 rounded-2xl bg-card/80 border border-border backdrop-blur-md shadow-xl">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Time Remaining</p>
            <h1 className="text-4xl font-bold text-primary">{formatTime(seconds)}</h1>
          </div>

          {/* Sound toggle ONLY visible in Clash mode */}
          {gameMode === 'clash-royale' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  if (!next) {
                    bgAudioRef.current?.pause();
                    sfxAudioRef.current?.pause();
                  } else if (gameState === 'playing') {
                    bgAudioRef.current?.play().catch(() => {});
                  }
                }}
                className="px-3 py-2 rounded-lg border bg-muted/50 hover:bg-muted transition"
                title={soundOn ? 'Sound: On' : 'Sound: Off'}
              >
                {soundOn ? '🔊 Sound: On' : '🔇 Sound: Off'}
              </button>
            </div>
          )}

          <div className="text-center space-y-3">
            {playerList.map(p => (
              <div key={p.id}
                className={`px-4 py-2 rounded-lg border ${p.id === (mySocketIdRef.current || socketRef.current?.id) ? 'bg-primary/20 border-primary' : 'bg-muted/50 border-border'}`}>
                <h2 className="text-2xl font-bold text-primary">{p.score}</h2>
                <h3 className="text-sm text-muted-foreground">{p.name}</h3>
              </div>
            ))}
          </div>
        </div>

        <div
          className="w-full relative bg-card/40 border border-border rounded-2xl shadow-inner backdrop-blur-sm mb-6 overflow-hidden"
          style={{ minHeight: '450px' }}
        >
          {fallingWords.map(word => {
            const isSpinning = spinningWordIds.has(word.id);
            return (
              <div
                key={word.id}
                className={`absolute text-3xl font-bold transition-all ease-linear text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)] ${isSpinning ? 'spinning-word' : ''}`}
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
    </div>
  );
}

export default Index;
