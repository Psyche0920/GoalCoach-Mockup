import React from 'react';

interface GoalCoachLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

export const GoalCoachLogo: React.FC<GoalCoachLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Clean Leaf Sprout SVG matching user's mockup */}
      <div className={`${iconSizes[size]} shrink-0 text-emerald-600`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-xs"
        >
          {/* Main Leaf (tilted left-up) */}
          <path
            d="M8 38C8 38 10 22 24 14C24 14 26 26 16 34C13 36.4 10 37.6 8 38Z"
            fill="#16a34a"
          />
          <path
            d="M8 38C13 32 18 25 24 14"
            stroke="#15803d"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Secondary Leaf (tilted right) */}
          <path
            d="M20 28C22 21 34 18 40 18C40 18 39 30 29 33C25 34.2 21.5 32 20 28Z"
            fill="#22c55e"
          />
          <path
            d="M20 28C26 26 33 23 40 18"
            stroke="#16a34a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Sprout Stem */}
          <path
            d="M8 38C12 40 16 41 20 41"
            stroke="#15803d"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex flex-col">
        <div className={`font-black tracking-tight text-slate-900 ${textSizes[size]} leading-none flex items-center`}>
          Goal<span className="text-emerald-600">Coach</span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] font-bold text-slate-400 tracking-normal mt-0.5">
            Learn Smarter. Chinese for Your Goals.
          </span>
        )}
      </div>
    </div>
  );
};
