import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';

// Raindrop background component
const RainBackground = () => (
  <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
    <style>{`
      @keyframes rainFall {
        0% { 
          transform: translateY(-10vh) translateX(0) rotate(0deg); 
          opacity: 0; 
        }
        10% { opacity: 0.8; }
        90% { opacity: 0.8; }
        100% { 
          transform: translateY(110vh) translateX(20px) rotate(180deg); 
          opacity: 0; 
        }
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
    {Array.from({ length: 80 }).map((_, i) => (
      <div
        key={i}
        className="raindrop"
        style={{
          left: `${Math.random() * 100}%`,
          width: `${Math.random() * 3 + 1}px`,
          height: `${Math.random() * 15 + 8}px`,
          animationDelay: `${Math.random() * 3}s`,
          animationDuration: `${Math.random() * 2 + 2}s`,
        }}
      />
    ))}
  </div>
);

// Helper: format time as MM:SS
const formatTime = (secs: number) => {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

interface FallingWord {
  id: string;
  text: string;
  top: number;
  left: number;
}

interface Player {
  id: string;
  name: string;
  score: number;
  gameMode: string;
}

function Index() {
  const [username, setUsername] = useState("");
  const [gameMode, setGameMode] = useState<'normal' | 'clash-royale'>('normal');
  const [gameState, setGameState] = useState<'start' | 'waiting' | 'countdown' | 'playing' | 'gameover'>('start');
  const [countdown, setCountdown] = useState(3);
  const [seconds, setSeconds] = useState(300);
  const [score, setScore] = useState(0);
  const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
  const [typedWord, setTypedWord] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [playerList, setPlayerList] = useState<Player[]>([]);
  

  const socketRef = useRef<any>(null);
  const mySocketIdRef = useRef<string | null>(null);

  const serverURL = useMemo(
    () => import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',
    []
  );

  // Falling animation
  useEffect(() => {
    if (gameState !== 'playing') return;
    const fall = setInterval(() => {
      setFallingWords((prev) =>
        prev
          .map(w => ({ ...w, top: w.top + 1 }))
          .filter(w => w.top <= 95)
      );
    }, 50);
    return () => clearInterval(fall);
  }, [gameState]);

  // Socket setup
  const setupSocketListeners = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('connect', () => {
      mySocketIdRef.current = socket.id;
    });

    socket.on('player_list', ({ players }: { players: Player[] }) => {
      setPlayerList(players);
      const me = players.find(p => p.id === mySocketIdRef.current);
      if (me) setScore(me.score);
    });

    socket.on('game_start', () => {
      setGameState('countdown');
      setCountdown(3);
      setFallingWords([]);
      setTypedWord('');
      setScore(0);
    });

    socket.on('timer', ({ remainingMs }: { remainingMs: number }) => {
      const s = Math.max(0, Math.floor(remainingMs / 1000));
      setSeconds(s);
      if (s <= 0 && gameState === 'playing') setGameState('gameover');
    });

    socket.on('new_word', ({ id, text }: { id: string; text: string }) => {
      const left = Math.random() * 70 + 10;
      setFallingWords(prev => [...prev, { id, text, top: 0, left }]);
    });

    socket.on('word_result', ({ wordId, correct, scorerId, newScore }: any) => {
      if (correct) {
        setFallingWords(prev => prev.filter(w => w.id !== wordId));
        if (scorerId === mySocketIdRef.current && typeof newScore === 'number') {
          setScore(newScore);
          setTypedWord('');
        }
      }
    });

    socket.on('game_end', ({ winnerName }: { winnerName: string }) => {
      setWinnerName(winnerName);
      setGameState('gameover');
    });

    socket.on('reset', () => {
      setFallingWords([]);
      setScore(0);
      setSeconds(300);
      setGameState('start');
    });

    socket.on("game_mode_mismatch", ({ message }) => {
      alert(message);                  // show popup
  // OR update a variable / DOM element
    // document.getElementById("status").textContent = message;
  });
  };

  

  const ensureSocket = () => {
    if (socketRef.current?.connected) return socketRef.current;
    socketRef.current = io(serverURL, { transports: ['websocket'] });
    setupSocketListeners();
    return socketRef.current;
  };

  // Countdown effect
  useEffect(() => {
    if (gameState !== 'countdown') return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setGameState('playing');
    }
  }, [gameState, countdown]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setTypedWord(value);

    const hit = fallingWords.find(w => String(w.text).toLowerCase() === value);
    if (!hit) return;

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('typed', { wordId: hit.id, text: hit.text });
    }
  };

  const onClickStart = () => {
    if (!username.trim()) return;
    const socket = ensureSocket();
    socket.emit('join', { name: username.trim(), mode: gameMode });
    setGameState('waiting');
  };

  // Start Screen
  if (gameState === 'start') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground />
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

  // Waiting Room
  if (gameState === 'waiting') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-4xl font-extrabold mb-6 text-primary">Waiting Room</h1>
          <div className="mb-6">
            <p className="text-lg text-muted-foreground mb-4">Players in lobby:</p>
            <div className="space-y-2">
              {playerList.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border transition-all ${
                    player.id === mySocketIdRef.current
                      ? 'bg-primary/20 border-primary shadow-[var(--glow-primary)]'
                      : 'bg-muted border-border'
                  }`}
                >
                  <p className="font-semibold text-foreground">
                    {player.name} {player.id === mySocketIdRef.current && '(You)'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            <p className="ml-2">Waiting for game to start</p>
          </div>
        </div>
      </div>
    );
  }

  // Countdown Screen
  if (gameState === 'countdown') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground />
        <div className="relative z-10 text-center">
          <h2 className="text-3xl font-bold mb-8 text-primary">Get Ready!</h2>
          <div className="text-[12rem] font-extrabold bg-gradient-to-br from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse">
            {countdown}
          </div>
          <p className="text-2xl text-muted-foreground mt-8">Game starts soon...</p>
        </div>
      </div>
    );
  }

  // Game Over
  if (gameState === 'gameover') {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-background text-foreground overflow-hidden">
        <RainBackground />
        <div className="relative z-10 bg-card border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md text-center backdrop-blur-sm">
          <h1 className="text-5xl font-extrabold mb-6 text-destructive">Game Over</h1>
          <p className="text-3xl mb-4">
            Your Score: <span className="text-primary font-bold">{score}</span>
          </p>
          {winnerName && (
            <p className="text-2xl mb-6 text-secondary">
              Winner: <span className="font-bold">{winnerName}</span>
            </p>
          )}
          <button
            onClick={() => {
              setGameState('start');
              setPlayerList([]);
              setSeconds(300);
            }}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg transition-all duration-200 hover:shadow-[var(--glow-primary)]"
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
      <RainBackground />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl p-4 pt-8">
        <div className="flex justify-between items-start w-full mb-6 p-6 rounded-2xl bg-card/80 border border-border backdrop-blur-md shadow-xl">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Time Remaining</p>
            <h1 className="text-4xl font-bold text-primary">{formatTime(seconds)}</h1>
          </div>
          <div className="text-center space-y-3">
            {playerList.map(p => (
              <div
                key={p.id}
                className={`px-4 py-2 rounded-lg border transition-all ${
                  p.id === mySocketIdRef.current
                    ? 'bg-primary/20 border-primary shadow-[var(--glow-primary)]'
                    : 'bg-muted/50 border-border'
                }`}
              >
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
          {fallingWords.map(word => (
            <div
              key={word.id}
              className="absolute text-3xl font-bold transition-all ease-linear text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
              style={{ top: `${word.top}%`, left: `${word.left}%` }}
            >
              {word.text}
            </div>
          ))}
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