import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { getShuffledWords } from './wordList';

// === Helper: format time as MM:SS ===
const formatTime = (secs) => {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

function App() {
  // ------ local single-player fallback (ยังเก็บไว้ แต่จะไม่ใช้เมื่อเชื่อม server) ------
  const [wordPool, setWordPool] = useState(getShuffledWords());

  // ------ core states ------
  const [started, setStarted] = useState(false);
  const [username, setUsername] = useState("");
  const [seconds, setSeconds] = useState(300);
  const [score, setScore] = useState(0);
  const [fallingWords, setFallingWords] = useState([]);
  const [typedWord, setTypedWord] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const [playerList, setPlayerList] = useState([]);

  // multiplayer refs/state
  const socketRef = useRef(null);  
  const mySocketIdRef = useRef(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);

  // ใช้ลูปทำให้คำ "ตกลงมา" (ทั้ง single และ multi)
  useEffect(() => {
    if (!started || gameOver) return;
    const fall = setInterval(() => {
      setFallingWords((prev) =>
        prev
          .map(w => ({ ...w, top: (w.top ?? 0) + 1 }))
          .filter(w => (w.top ?? 0) <= 95)
      );
    }, 50);
    return () => clearInterval(fall);
  }, [started, gameOver]);

  // Countdown (เฉพาะโหมด single-player เท่านั้น)
  useEffect(() => {
    if (isMultiplayer) return; // ให้ server คุมเวลา
    if (!started || seconds <= 0 || gameOver) {
      if (seconds <= 0 && started) setGameOver(true);
      return;
    }
    const t = setInterval(() => setSeconds((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [started, seconds, gameOver, isMultiplayer]);

  // ------ Socket setup (สร้างเฉพาะตอนเริ่มเกมด้วยปุ่ม) ------
  const serverURL = useMemo(
    () => import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',
    []
  );

  const setupSocketListeners = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('connect', () => {
      mySocketIdRef.current = socket.id;
    });

    // รายชื่อผู้เล่น (UI หลักยังคงเดิม แต่เราสามารถใช้ข้อมูลนี้ในอนาคตได้)
    socket.on('player_list', ({ players }) => {
  setPlayerList(players); // store all players
  const me = players.find(p => p.id === mySocketIdRef.current);
  if (me) setScore(me.score);
});

    // เริ่มเกมจาก server พร้อมกัน
    socket.on('game_start', ({ startAtMs }) => {
      // เคลียร์สถานะ
      setFallingWords([]);
      setTypedWord('');
      setScore(0);
      setGameOver(false);
      setStarted(true);

      // ถ้าอยากหน่วงตาม startAtMs สามารถใช้ setTimeout ได้
      // ที่นี่ให้เริ่มทันที และให้ server ส่ง timer มาคุมเวลา
    });

    // เวลา
    socket.on('timer', ({ remainingMs }) => {
      const s = Math.max(0, Math.floor(remainingMs / 1000));
      setSeconds(s);
      if (s <= 0) setGameOver(true);
    });

    // คำใหม่จาก server
    socket.on('new_word', ({ id, text /*, spawnAtMs*/ }) => {
      const left = Math.random() * 70 + 10; // สุ่มแนวนอนเหมือนเดิม
      setFallingWords(prev => [...prev, { id, text, top: 0, left }]);
    });

    // ผลตรวจคำที่พิมพ์
    socket.on('word_result', ({ wordId, correct, scorerId, newScore }) => {
      if (correct) {
        // ลบคำที่ถูกแล้ว
        setFallingWords(prev => prev.filter(w => w.id !== wordId));
        // ถ้าเราเป็นคนทำถูก ให้ตั้งคะแนนตามที่ server ส่งมา
        if (scorerId === mySocketIdRef.current && typeof newScore === 'number') {
          setScore(newScore);
          setTypedWord('');
        }
      } else {
        // พิมพ์ผิด อาจสั่น input หรือแจ้งเตือนภายหลังได้
      }
    });

    // จบเกม
    socket.on('game_end', ({ winnerName }) => {
      setWinnerName(winnerName);
      setGameOver(true);
      // สามารถโชว์ชื่อผู้ชนะได้ถ้าต้องการ
      // ที่นี่คง UI เดิม: เพียงแสดง Game Over + score
    });

    // reset จากฝั่ง server
    socket.on('reset', () => {
      setFallingWords([]);
      setScore(0);
      setSeconds(300);
      setGameOver(false);
      setStarted(false);
    });
  };

  const ensureSocket = () => {
    if (socketRef.current?.connected) return socketRef.current;
    socketRef.current = io(serverURL, { transports: ['websocket'] });
    setupSocketListeners();
    return socketRef.current;
  };

  // ------ Typing / scoring ------
  const handleTyping = (e) => {
    const value = e.target.value.toLowerCase();
    setTypedWord(value);

    // หา "คำบนจอ" ที่ตรงกับสิ่งที่พิมพ์
    const hit = fallingWords.find(w => String(w.text).toLowerCase() === value);
    if (!hit) return;

    if (isMultiplayer) {
      // ให้ server ตรวจ
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('typed', { wordId: hit.id, text: hit.text });
      }
      // อย่าเคลียร์เอง รอ server ส่ง word_result
    } else {
      // single-player เดิม
      setScore((s) => s + 1);
      setFallingWords((prev) => prev.filter(w => w.id !== hit.id));
      setTypedWord('');
    }
  };

  // ------ Start button ------
  const onClickStart = () => {
    if (!username.trim()) return;

    // สลับเป็นโหมด multiplayer และเชื่อมต่อ server
    setIsMultiplayer(true);
    const socket = ensureSocket();
    // join พร้อมชื่อ
    socket.emit('join', { name: username.trim() });
    // ไม่เริ่มนับเวลาฝั่ง client ให้ server เป็นคนสั่งเริ่ม (game_start)
    setSeconds(300);
    setGameOver(false);
    setScore(0);
    setFallingWords([]);
    // แสดงหน้าจอหลักให้รอ (fallingWords จะเริ่มไหลเมื่อได้ new_word)
    setStarted(true);
  };

  // ------ Start screen ------
  if (!started) {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
          <style>{`
            @keyframes rain {
              0% { transform: translateY(0) rotate(0deg); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateY(100vh) rotate(180deg); opacity: 0; }
            }
            .raindrop { animation: rain 2s linear infinite; background-color: rgba(173,216,230,.5); border-radius: 50%; position: absolute; }
          `}</style>
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className="raindrop" style={{
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 8 + 4}px`,
              animationDelay: `${Math.random() * 2}s`,
            }} />
          ))}
        </div>

        <div className="relative z-10 bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
          <h1 id="title_mainPage" className="text-5xl font-extrabold mb-4 animate-pulse">Rainy Words</h1>
          <input
            id="name"
            className="w-full p-3 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            placeholder="Insert name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            onClick={onClickStart}
            disabled={!username.trim()}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Start game
          </button>
          {isMultiplayer && (
            <p className="mt-3 text-sm text-gray-300">Connecting to server… waiting for players</p>
          )}
        </div>
      </div>
    );
  }

  // ------ Game over ------
  if (gameOver) {
  return (
    <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
        <h1 className="text-4xl font-extrabold mb-4 text-red-400">Game Over</h1>
        <p className="text-2xl mb-2 text-white">
          Final Score: <span className="text-green-400 font-bold">{score}</span>
        </p>
        <p className="text-xl mb-4 text-yellow-300">
          Winner: {winnerName || 'N/A'}
        </p>
        <button
          onClick={() => {
            setStarted(false);
            setGameOver(false);
            setIsMultiplayer(false);
            setSeconds(300);
          }}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors duration-200"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}

  // ------ Game play ------
  return (
    <div className="relative flex flex-col items-center min-h-screen w-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <style>{`
          @keyframes rain {
            0% { transform: translateY(0) rotate(0deg); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(100vh) rotate(180deg); opacity: 0; }
          }
          .raindrop { animation: rain 2s linear infinite; background-color: rgba(173,216,230,.5); border-radius: 50%; position: absolute; }
        `}</style>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="raindrop" style={{
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 2 + 1}px`,
            height: `${Math.random() * 8 + 4}px`,
            animationDelay: `${Math.random() * 2}s`,
          }} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-xl">
  <div className="flex justify-between w-full mb-4 p-4 rounded-lg bg-gray-800 bg-opacity-70 backdrop-blur-sm shadow-md">
    <div className="text-center">
      <h1 id="time_left" className="text-3xl font-bold text-gray-300">
        Time: {formatTime(seconds)}
      </h1>
    </div>
    <div className="text-center space-y-1">
      {playerList.map(p => (
        <div key={p.id}>
          <h2 className="text-2xl font-bold text-green-400">{p.score}</h2>
          <h3 className="text-lg text-gray-400">Player: {p.name}</h3>
        </div>
      ))}
    </div>
  </div>


        <div className="flex-grow w-full relative bg-gray-800 bg-opacity-50 rounded-lg shadow-inner mb-4 overflow-hidden" style={{ minHeight: '400px' }}>
          {fallingWords.map(word => (
            <div key={word.id} className="absolute text-2xl font-bold transition-all ease-linear text-white animate-pulse" style={{ top: `${word.top ?? 0}%`, left: `${word.left ?? 10}%` }}>
              {word.text}
            </div>
          ))}
        </div>

        <div className="w-full p-4 bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-lg shadow-md">
          <input
            type="text"
            autoFocus
            value={typedWord}
            onChange={handleTyping}
            className="w-full p-4 rounded-lg bg-gray-700 text-white text-xl text-center placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type the words here..."
          />
        </div>
      </div>
    </div>
  );
}

export default App;
//E nokok