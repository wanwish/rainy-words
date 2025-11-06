import React, { useState } from "react";

export default function HowToPlay() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Button to open modal */}
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-primary underline hover:text-primary/80 transition"
      >
        How to Play
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card text-foreground rounded-2xl shadow-2xl border border-border w-[90%] max-w-md p-8 text-center relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-4 text-muted-foreground hover:text-foreground text-xl"
            >
              ×
            </button>

            <h2 className="text-2xl font-bold mb-6 text-primary">How to Play</h2>

            <ol className="space-y-4 text-base font-medium text-center leading-relaxed">
              <li>1. Create or join a room.</li>
              <li>2. Type the falling words before they hit the ground.</li>
              <li>3. Each correct word earns points. Keep typing to win!</li>
              <li>4. Highest score when the timer ends wins.</li>
            </ol>

            <button
              onClick={() => setOpen(false)}
              className="mt-8 px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shadow transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
