import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

// ดรอปเร็วแค่ไหน (px/วินาที) ปรับได้
const DROP_SPEED_PX_S = 80;
// สูงสุดที่ตกถึงก่อนลบออก (px) — แค่เพื่อ UI
const FLOOR_Y = 420;

export default function App() {
  const socketRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);

  const [players, setPlayers] = useState([]); // [{id,name,score}]
  const [welcome, setWelcome] = useState("");
  const [running, setRunning] = useState(false);
  const [startAtMs, setStartAtMs] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [winner, setWinner] = useState(null); // {winnerName, scores}

  // คำที่กำลังตก: Map<id, {id,text,spawnAtMs,x,y}>
  const [words, setWords] = useState(new Map());

  // ช่องพิมพ์
  const [typed, setTyped] = useState("");

  // สำหรับอนิเมชันตกลง (requestAnimationFrame)
  const rafRef = useRef(0);

  // สุ่มตำแหน่ง X ให้คำแต่ละคำ (deterministic จาก id จะดีที่สุด)
  const randomX = (id) => {
    // pseudo-random จาก id
    const n = (Math.sin(id * 99991) + 1) / 2; // 0..1
    const minX = 24, maxX = 580;
    return Math.floor(minX + n * (maxX - minX));
  };

  // เชื่อมต่อ socket
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setRunning(false);
    });

    socket.on("welcome", ({ message }) => setWelcome(message));

    socket.on("player_list", ({ players }) => setPlayers(players));

    socket.on("game_start", ({ startAtMs }) => {
      setStartAtMs(startAtMs);
      setRunning(true);
      setWinner(null);
      // ล้างคำที่ค้าง
      setWords(new Map());
    });

    socket.on("new_word", ({ id, text, spawnAtMs }) => {
      setWords((prev) => {
        const next = new Map(prev);
        next.set(id, { id, text, spawnAtMs, x: randomX(id), y: 0 });
        return next;
      });
    });

    socket.on("word_result", ({ wordId, correct, scorerId, newScore }) => {
      if (correct) {
        // ลบคำออกและอัปเดตคะแนน (เซิร์ฟเวอร์ก็ส่ง player_list มาด้วยอยู่แล้ว)
        setWords((prev) => {
          if (!prev.has(wordId)) return prev;
          const next = new Map(prev);
          next.delete(wordId);
          return next;
        });
      }
      // ถ้าอยากไฮไลต์ผลลัพธ์เฉพาะผู้พิมพ์ เพิ่ม state/flash ได้
    });

    socket.on("timer", ({ remainingMs }) => setRemainingMs(remainingMs));

    socket.on("game_end", ({ winnerName, scores }) => {
      setRunning(false);
      setWinner({ winnerName, scores });
    });

    socket.on("reset", () => {
      setRunning(false);
      setWinner(null);
      setWords(new Map());
      setTyped("");
      setRemainingMs(0);
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, []);

  // เข้าร่วมห้องเมื่อกด Join
  const handleJoin = (e) => {
    e.preventDefault();
    if (!socketRef.current) return;
    if (!name.trim()) return;
    socketRef.current.emit("join", { name: name.trim() });
    setJoined(true);
  };

  // ส่ง typed ไปตรวจ เมื่อ Enter
  const handleSubmitTyped = (e) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || !running) return;

    // หา wordId แรกที่มี text ตรงกัน (ถ้าซ้ำกันให้ตัวที่ spawn ก่อน)
    const candidates = [...words.values()]
      .filter((w) => w.text === text)
      .sort((a, b) => a.spawnAtMs - b.spawnAtMs);

    if (candidates.length > 0) {
      socketRef.current?.emit("typed", { wordId: candidates[0].id, text });
      setTyped("");
    }
  };

  // อนิเมชันคำตก
  useEffect(() => {
    const loop = () => {
      setWords((prev) => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);

        for (const [id, w] of next) {
          // y = speed * (elapsed seconds)
          const elapsed = Math.max(0, now - w.spawnAtMs) / 1000;
          const y = Math.min(FLOOR_Y, Math.floor(elapsed * DROP_SPEED_PX_S));
          if (y !== w.y) {
            next.set(id, { ...w, y });
            changed = true;
          }
          // ถ้าตกถึงพื้น แล้วยังไม่ถูกพิมพ์ ถูกใจจะปล่อยค้างไว้/ลบออกได้
          if (y >= FLOOR_Y) {
            // ไม่บังคับลบออก ให้ค้างเพื่อความง่ายในการสังเกตตกแล้วพลาด
          }
        }
        return changed ? next : prev;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const countdown = useMemo(() => {
    const s = Math.max(0, Math.floor(remainingMs / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [remainingMs]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ margin: 0 }}>Rainy Words</h1>
        <small>
          Server: {SERVER_URL} | {connected ? "🟢 connected" : "🔴 offline"}
        </small>

        {!joined ? (
          <form onSubmit={handleJoin} style={{ marginTop: 16 }}>
            <label>
              Nickname:&nbsp;
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                required
              />
            </label>
            <button style={styles.btn} type="submit" disabled={!connected}>
              Join
            </button>
          </form>
        ) : (
          <>
            <p style={{ marginTop: 8 }}>{welcome}</p>

            <div style={styles.topbar}>
              <div>
                {players.map((p) => (
                  <span key={p.id} style={styles.badge}>
                    {p.name}: {p.score}
                  </span>
                ))}
              </div>
              <div style={styles.timer}>{running ? countdown : "00:00"}</div>
            </div>

            <div style={styles.arena}>
              {[...words.values()].map((w) => (
                <div
                  key={w.id}
                  style={{
                    position: "absolute",
                    left: w.x,
                    top: w.y,
                    userSelect: "none",
                  }}
                >
                  {w.text}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmitTyped} style={{ marginTop: 12 }}>
              <input
                placeholder="Type falling word and press Enter"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={!running}
                autoFocus
                style={{ width: 360 }}
              />
              <button style={styles.btn} type="submit" disabled={!running}>
                Submit
              </button>
            </form>

            {!running && winner && (
              <div style={styles.modal}>
                <div style={styles.modalCard}>
                  <h3 style={{ marginTop: 0 }}>Game Over</h3>
                  <p>
                    Winner: <b>{winner.winnerName}</b>
                  </p>
                  <pre style={styles.pre}>
                    {JSON.stringify(winner.scores, null, 2)}
                  </pre>
                  <small>Waiting for server to reset/start…</small>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    background: "#f5f6f7",
    fontFamily: "system-ui, Arial, sans-serif",
  },
  card: {
    width: 720,
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
    position: "relative",
  },
  btn: {
    marginLeft: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fafafa",
    cursor: "pointer",
  },
  topbar: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 32,
  },
  badge: {
    display: "inline-block",
    background: "#eef2ff",
    border: "1px solid #e0e7ff",
    borderRadius: 999,
    padding: "4px 10px",
    marginRight: 6,
  },
  timer: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  },
  arena: {
    marginTop: 12,
    border: "1px dashed #d1d5db",
    height: 460,
    borderRadius: 12,
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(247,250,255,1) 100%)",
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.25)",
    display: "grid",
    placeItems: "center",
  },
  modalCard: {
    background: "white",
    borderRadius: 12,
    padding: 16,
    width: 360,
    border: "1px solid #e5e7eb",
  },
  pre: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: 8,
    borderRadius: 8,
    maxHeight: 180,
    overflow: "auto",
  },
};
