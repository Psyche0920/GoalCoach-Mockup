import React from 'react';

export type PandaMood = 'idle' | 'happy' | 'thinking' | 'cheering' | 'studying';

interface PandaMascotProps {
  mood?: PandaMood;
  size?: number;
  className?: string;
  speech?: string;
  showNameBadge?: boolean;
}

export const PandaMascot: React.FC<PandaMascotProps> = ({
  mood = 'idle',
  size = 120,
  className = '',
  speech,
  showNameBadge = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="relative shrink-0 transition-transform duration-300 hover:scale-105"
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-sm"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Panda Ears */}
          <circle cx="56" cy="52" r="26" fill="#1e293b" />
          <circle cx="56" cy="52" r="16" fill="#334155" />
          <circle cx="144" cy="52" r="26" fill="#1e293b" />
          <circle cx="144" cy="52" r="16" fill="#334155" />

          {/* Panda Body (Round bottom) */}
          <ellipse cx="100" cy="146" rx="60" ry="46" fill="#ffffff" stroke="#1e293b" strokeWidth="6" />

          {/* White Belly */}
          <ellipse cx="100" cy="148" rx="42" ry="34" fill="#f8fafc" />

          {/* Panda Head */}
          <ellipse cx="100" cy="100" rx="66" ry="56" fill="#ffffff" stroke="#1e293b" strokeWidth="6" />

          {/* Eye Patches (Characteristic angled tear-drop ovals) */}
          <ellipse cx="72" cy="94" rx="18" ry="22" transform="rotate(-18 72 94)" fill="#1e293b" />
          <ellipse cx="128" cy="94" rx="18" ry="22" transform="rotate(18 128 94)" fill="#1e293b" />

          {/* Eye Highlights */}
          {mood === 'happy' || mood === 'cheering' ? (
            <>
              {/* Happy squint crescent eyes */}
              <path
                d="M62 94 Q72 82 82 94"
                stroke="#ffffff"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M118 94 Q128 82 138 94"
                stroke="#ffffff"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : mood === 'thinking' ? (
            <>
              {/* Curious looking up */}
              <circle cx="74" cy="90" r="7" fill="#ffffff" />
              <circle cx="76" cy="88" r="4" fill="#0f172a" />
              <circle cx="130" cy="90" r="7" fill="#ffffff" />
              <circle cx="132" cy="88" r="4" fill="#0f172a" />
            </>
          ) : (
            <>
              {/* Big friendly sparkling eyes */}
              <circle cx="72" cy="94" r="8" fill="#ffffff" />
              <circle cx="74" cy="93" r="4.5" fill="#0f172a" />
              <circle cx="69" cy="91" r="2" fill="#ffffff" />

              <circle cx="128" cy="94" r="8" fill="#ffffff" />
              <circle cx="126" cy="93" r="4.5" fill="#0f172a" />
              <circle cx="123" cy="91" r="2" fill="#ffffff" />
            </>
          )}

          {/* Rosy Cheeks (Gentle Coral Blush from Mockup) */}
          <ellipse cx="50" cy="112" rx="10" ry="6" fill="#fca5a5" opacity="0.65" />
          <ellipse cx="150" cy="112" rx="10" ry="6" fill="#fca5a5" opacity="0.65" />

          {/* Nose */}
          <path
            d="M93 108 C93 104 107 104 107 108 C107 113 100 115 100 115 C100 115 93 113 93 108 Z"
            fill="#1e293b"
          />

          {/* Cheerful Mouth */}
          <path
            d="M92 118 Q100 128 108 118"
            stroke="#1e293b"
            strokeWidth="4"
            strokeLinecap="round"
            fill="#f43f5e"
          />

          {/* Arms / Green Book (Matching Mockup Screen 1) */}
          {/* Left Hand: Waving High */}
          <path
            d="M44 136 C32 120 32 98 44 94 C54 90 58 106 50 124"
            fill="#1e293b"
          />
          <circle cx="42" cy="96" r="10" fill="#1e293b" />

          {/* Right Hand holding the Green Book */}
          <g>
            {/* Green Book Cover */}
            <rect
              x="120"
              y="126"
              width="36"
              height="44"
              rx="5"
              transform="rotate(12 120 126)"
              fill="#16a34a"
              stroke="#15803d"
              strokeWidth="2.5"
            />
            {/* Book Spine Accent */}
            <line
              x1="124"
              y1="130"
              x2="132"
              y2="168"
              stroke="#22c55e"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Book Pages */}
            <rect
              x="124"
              y="128"
              width="28"
              height="38"
              rx="3"
              transform="rotate(12 124 128)"
              fill="#ffffff"
              opacity="0.9"
            />
            {/* Right Paw holding book */}
            <ellipse cx="140" cy="148" rx="10" ry="12" transform="rotate(12 140 148)" fill="#1e293b" />
          </g>

          {/* Little Feet */}
          <ellipse cx="74" cy="184" rx="18" ry="12" fill="#1e293b" />
          <ellipse cx="126" cy="184" rx="18" ry="12" fill="#1e293b" />
        </svg>

        {showNameBadge && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
            Bǎobao 宝包
          </div>
        )}
      </div>

      {/* Speech Bubble */}
      {speech && (
        <div className="relative bg-white border-2 border-slate-900 rounded-2xl px-3.5 py-2.5 shadow-[2px_2px_0px_#0f172a] max-w-xs text-xs font-bold text-slate-900">
          <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-0 h-0 border-t-6 border-t-transparent border-r-6 border-r-slate-900 border-b-6 border-b-transparent" />
          <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-r-[5px] border-r-white border-b-[5px] border-b-transparent" />
          {speech}
        </div>
      )}
    </div>
  );
};
