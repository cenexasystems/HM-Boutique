import React from "react";

// Simple line drawings of each neckline (viewBox 60x42).
const PATHS: Record<string, string> = {
  "V Neck": "M10 5 L30 36 L50 5",
  Round: "M8 5 Q30 46 52 5",
  Square: "M16 5 V30 H44 V5",
  Boat: "M5 14 Q30 22 55 14",
  Sweetheart: "M12 5 V16 Q20 30 30 19 Q40 30 48 16 V5",
  Queen: "M18 5 Q8 16 22 25 L30 38 L38 25 Q52 16 42 5",
  Pentagon: "M14 5 V20 L30 35 L46 20 V5",
  Keyhole: "M18 5 Q30 26 42 5 M30 24 m-4 5 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
  Teardrop: "M20 5 Q30 22 40 5 M30 22 Q19 33 30 39 Q41 33 30 22",
  Collar: "M8 7 L22 29 L30 20 L38 29 L52 7 L44 5 L30 14 L16 5 Z",
  "Round With Cut": "M16 5 Q30 26 44 5 M30 24 V38",
};

export default function NeckTypeIcon({ type, className = "w-14 h-10" }: { type: string; className?: string }) {
  // Custom (user-added) neck types have no drawing; show a generic neckline.
  const d = PATHS[type] ?? "M10 5 Q30 40 50 5 M24 28 L36 28";
  return (
    <svg viewBox="0 0 60 42" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
