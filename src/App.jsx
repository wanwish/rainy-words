import React, { useState, useEffect } from 'react';
import { getShuffledWords } from './wordList';
// === Helper function to get a shuffled list of words ===
// Since we are creating a single, self-contained file, this function
// replaces the external `getShuffledWords` import.
const _getShuffledWords = () => {
  
  return getShuffledWords();
};

// === Helper function to format time as MM:SS ===
// === Helper function to format time as MM:SS ===
const formatTime = (secs) => {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

// === App Component ===
function App() {
  const [words, setWords] = useState(getShuffledWords());
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [seconds, setSeconds] = useState(300);
  const [points1, setPoints1] = useState(0);
  const [fallingWords, setFallingWords] = useState([]);
  const [typedWord, setTypedWord] = useState('');
  const [gameOver, setGameOver] = useState(false);

  // === Countdown Timer Effect ===
  useEffect(() => {
    if (!started || seconds <= 0 || gameOver) {
      if (seconds <= 0 && started) {
        setGameOver(true);
      }
      return;
    }

    const timer = setInterval(() => {
      setSeconds(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [started, seconds, gameOver]);

  // === Falling Words Effect ===
  useEffect(() => {
    if (!started || gameOver) return;

    // Timer to add a new word every few seconds
    const wordSpawnInterval = setInterval(() => {
      const newFallingWord = {
        id: Math.random(),
        text: words[Math.floor(Math.random() * words.length)],
        top: 0,
        left: Math.random() * 80 + 10,
      };
      setFallingWords(prevWords => [...prevWords, newFallingWord]);
    }, 2000);

    // Timer to update the position of falling words
    const wordFallInterval = setInterval(() => {
      setFallingWords(prevWords => {
        const updatedWords = prevWords.map(word => ({
          ...word,
          top: word.top + 1,
        })).filter(word => {
          if (word.top > 95) {
            return false;
          }
          return true;
        });
        return updatedWords;
      });
    }, 50);

    return () => {
      clearInterval(wordSpawnInterval);
      clearInterval(wordFallInterval);
    };
  }, [started, words, gameOver]);

  // === Word Matching and Scoring Logic ===
  const handleTyping = (e) => {
    const value = e.target.value.toLowerCase();
    setTypedWord(value);

    const matchedWord = fallingWords.find(word => word.text === value);
    if (matchedWord) {
      setPoints1(prev => prev + 1);
      setFallingWords(prevWords => prevWords.filter(word => word.id !== matchedWord.id));
      setTypedWord('');
    }
  };

  // === Start Screen UI ===
  if (!started) {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
        {/* Background rain effect */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
          <style>
            {`
              @keyframes rain {
                0% { transform: translateY(0) rotate(0deg); opacity: 0; }
                50% { opacity: 1; }
                100% { transform: translateY(100vh) rotate(180deg); opacity: 0; }
              }
              .raindrop {
                animation: rain 2s linear infinite;
                background-color: rgba(173, 216, 230, 0.5);
                border-radius: 50%;
                position: absolute;
              }
            `}
          </style>
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="raindrop"
              style={{
                left: `${Math.random() * 100}%`,
                width: `${Math.random() * 2 + 1}px`,
                height: `${Math.random() * 8 + 4}px`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            ></div>
          ))}
        </div>
        
        {/* Main content container */}
        <div className="relative z-10 bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
          <h1 id="title_mainPage" className="text-5xl font-extrabold mb-4 animate-pulse">Rainy Word</h1>
          <input
            id="name"
            className="w-full p-3 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            placeholder="Insert name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button
            onClick={() => {
              if (playerName.trim()) {
                setSeconds(300);
                setStarted(true);
                setGameOver(false);
                setPoints1(0);
                setFallingWords([]);
              }
            }}
            disabled={!playerName.trim()}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Start game
          </button>
        </div>
      </div>
    );
  }

  // === Game Over Screen UI ===
  if (gameOver) {
    return (
      <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
        <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
          <h1 className="text-4xl font-extrabold mb-4 text-red-400">Game Over</h1>
          <p className="text-2xl mb-4 text-white">Final Score: <span className="text-green-400 font-bold">{points1}</span></p>
          <button
            onClick={() => {
              setStarted(false);
              setGameOver(false);
            }}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors duration-200"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // === Game Play UI ===
  return (
    <div className="relative flex flex-col items-center min-h-screen w-screen bg-gray-900 text-white font-sans p-4 overflow-hidden">
      {/* Background rain effect */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <style>
          {`
            @keyframes rain {
              0% { transform: translateY(0) rotate(0deg); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateY(100vh) rotate(180deg); opacity: 0; }
            }
            .raindrop {
              animation: rain 2s linear infinite;
              background-color: rgba(173, 216, 230, 0.5);
              border-radius: 50%;
              position: absolute;
            }
          `}
        </style>
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="raindrop"
            style={{
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 8 + 4}px`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          ></div>
        ))}
      </div>

      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-xl">
        <div className="flex justify-between w-full mb-4 p-4 rounded-lg bg-gray-800 bg-opacity-70 backdrop-blur-sm shadow-md">
          <div className="text-center">
            <h1 id="time_left" className="text-3xl font-bold text-gray-300">Time: {formatTime(seconds)}</h1>
          </div>
          <div className="text-center">
            <h2 id="score_p1" className="text-3xl font-bold text-green-400">{points1}</h2>
            <h3 className="text-lg text-gray-400">Player: {playerName}</h3>
          </div>
        </div>

        <div className="flex-grow w-full relative bg-gray-800 bg-opacity-50 rounded-lg shadow-inner mb-4 overflow-hidden" style={{ minHeight: '400px' }}>
          {fallingWords.map(word => (
            <div
              key={word.id}
              className="absolute text-2xl font-bold transition-all ease-linear text-white animate-pulse"
              style={{ top: `${word.top}%`, left: `${word.left}%` }}
            >
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
